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

import type { CandidateEvent } from "./auto-ingest-types";
import {
  BLS_SERIES_BINDINGS,
  computeSurpriseInCanonicalUnit,
  deriveMetric,
  makeMetricHeadline,
  type Observation,
} from "./metrics";

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
  const sinceYear = new Date(opts.since).getUTCFullYear();
  const endYear = new Date().getUTCFullYear();
  if (!Number.isFinite(sinceYear)) {
    opts.log(`[BLS] ⚠ Invalid --since "${opts.since}"; skipping BLS source.`);
    return;
  }

  for (const binding of BLS_SERIES_BINDINGS) {
    const { seriesId, metric } = binding;
    opts.log(`[BLS]  Fetching ${seriesId} (${metric.canonicalName})…`);
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
      const occurredAt = new Date(`${obs.iso}T08:30:00-05:00`);
      if (Number.isNaN(occurredAt.getTime())) continue;

      yield {
        headline: makeMetricHeadline(metric, derived.value, derived.prior, obs.iso),
        eventType: metric.eventType,
        occurredAt,
        sourceUrl: `https://data.bls.gov/timeseries/${seriesId}`,
        source: "BLS",
        metricKey: metric.key,
        data: {
          metricName: metric.canonicalName,
          actualValue: derived.value,
          priorValue: derived.prior,
          expectedValue: null,
          surpriseMagnitude: computeSurpriseInCanonicalUnit(derived.value, null),
          rawActual: obs.value,
        },
      };
    }
  }
}
