/**
 * BLS source — POST request to https://api.bls.gov/publicAPI/v2/timeseries/data/.
 *
 * BLS caps requests at 20 years of data; paginate in 10-year chunks. No API key
 * required for low-volume access (BLS_API_KEY is optional, raises the daily
 * cap from 25 to 500).
 *
 * Transformations, canonical metric names and units come from `metrics.ts`,
 * shared with the FRED and curated pipelines. BLS series deliberately resolve
 * to the SAME canonical metrics as their FRED equivalents, so dedup treats a
 * BLS CPI-U print and a FRED CPIAUCSL print as one economic release.
 */

import {
  macroInitialEventKey,
  type CandidateEvent,
} from "./auto-ingest-types";
import {
  BLS_SERIES_BINDINGS,
  computeSurpriseInCanonicalUnit,
  deriveMetric,
  makeMetricHeadline,
  observationStartFor,
  type Observation,
} from "@/services/macro/metrics";
import { utcDateOnly } from "@/services/macro/time";

const BLS_BASE = "https://api.bls.gov/publicAPI/v2/timeseries/data/";

interface BlsDatum {
  year: string;
  period: string; // "M01"–"M12", "M13" = annual avg
  periodName: string;
  value: string;
}

interface BlsSeriesPayload {
  seriesID: string;
  data: BlsDatum[];
}

interface BlsResponse {
  status?: string;
  message?: string[];
  Results?: { series: BlsSeriesPayload[] };
}

const toFloat = (v: string): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function periodToIso(year: string, period: string): string | null {
  if (!period.startsWith("M")) return null; // skip "M13" annual averages
  const m = Number(period.slice(1));
  if (!Number.isInteger(m) || m < 1 || m > 12) return null;
  return `${year}-${m.toString().padStart(2, "0")}-01`;
}

async function fetchChunk(
  seriesIds: string[],
  startYear: number,
  endYear: number,
  apiKey: string | undefined,
): Promise<BlsSeriesPayload[]> {
  const body: Record<string, unknown> = {
    seriesid: seriesIds,
    startyear: String(startYear),
    endyear: String(endYear),
  };
  if (apiKey) body.registrationkey = apiKey;

  const res = await fetch(BLS_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`BLS HTTP ${res.status}`);
  const json = (await res.json()) as BlsResponse;
  if (json.status !== "REQUEST_SUCCEEDED") {
    const msg = json.message?.join("; ") ?? "unknown";
    throw new Error(`BLS API: ${json.status ?? "?"} — ${msg}`);
  }
  return json.Results?.series ?? [];
}


function sortAscending(data: BlsDatum[]): Observation[] {
  const out: Observation[] = [];
  for (const d of data) {
    const iso = periodToIso(d.year, d.period);
    if (!iso) continue;
    out.push({ iso, value: toFloat(d.value) });
  }
  out.sort((a, b) => a.iso.localeCompare(b.iso));
  return out;
}





export interface BlsSourceOptions {
  apiKey: string | undefined; // optional — public access works without one
  since: string; // ISO date
  log: (msg: string) => void;
}

const CHUNK_YEARS = 10;

export async function* yieldBlsEvents(
  opts: BlsSourceOptions,
): AsyncGenerator<CandidateEvent> {
  const endYear = new Date().getUTCFullYear();
  if (Number.isNaN(new Date(opts.since).getTime())) {
    opts.log(`[BLS] ⚠ Invalid --since "${opts.since}"; skipping BLS source.`);
    return;
  }

  for (const binding of BLS_SERIES_BINDINGS) {
    const { seriesId, metric } = binding;
    opts.log(`[BLS]  Fetching ${seriesId} (${metric.canonicalName})…`);
    // Start earlier than `since` so the transform has its lookback; the
    // orchestrator drops anything that resolves before the cutoff.
    const sinceYear = new Date(
      `${observationStartFor(metric, opts.since)}T00:00:00Z`,
    ).getUTCFullYear();
    const merged: BlsDatum[] = [];
    for (let y = sinceYear; y <= endYear; y += CHUNK_YEARS) {
      const chunkEnd = Math.min(y + CHUNK_YEARS - 1, endYear);
      try {
        const payloads = await fetchChunk([seriesId], y, chunkEnd, opts.apiKey);
        const payload = payloads.find((p) => p.seriesID === seriesId);
        if (payload) merged.push(...payload.data);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        opts.log(`[BLS]  ⚠ ${seriesId} ${y}-${chunkEnd}: ${detail}`);
      }
    }
    const ordered = sortAscending(merged);
    opts.log(
      `[BLS]    ${ordered.length} observation${ordered.length === 1 ? "" : "s"} found`,
    );

    for (let i = 0; i < ordered.length; i++) {
      const obs = ordered[i];
      const derived = deriveMetric(metric.transform, i, ordered);
      if (!derived) continue;
      // BLS `year` + `period` identify the period measured. The time-series API
      // does not return a publication date/time, so never turn this date into a
      // conventional 08:30 release timestamp.
      const referencePeriodStart = utcDateOnly(obs.iso);
      if (Number.isNaN(referencePeriodStart.getTime())) continue;
      const seriesUrl = `https://data.bls.gov/timeseries/${seriesId}`;

      yield {
        eventKey: macroInitialEventKey(metric.key, obs.iso),
        headline: makeMetricHeadline(metric, derived.value, derived.prior, obs.iso),
        eventType: metric.eventType,
        occurredAt: referencePeriodStart,
        releaseAt: null,
        releaseDate: null,
        timingStatus: "REFERENCE_PERIOD_ONLY",
        timingSource: "BLS_SERIES_PERIOD",
        sourceUrl: seriesUrl,
        source: "BLS",
        data: {
          metricKey: metric.key,
          metricName: metric.canonicalName,
          referencePeriodStart,
          actualValue: derived.value,
          priorValue: derived.prior,
          expectedValue: null,
          surpriseMagnitude: computeSurpriseInCanonicalUnit(derived.value, null),
          actualSource: "BLS",
          actualSourceUrl: seriesUrl,
          consensusStatus: "MISSING",
          consensusSource: null,
          consensusSourceUrl: null,
          consensusAsOf: null,
          rawActual: obs.value,
        },
      };
    }
  }
}
