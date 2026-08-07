/**
 * BLS source — POST request to https://api.bls.gov/publicAPI/v2/timeseries/data/.
 *
 * BLS caps requests at 20 years of data; paginate in 10-year chunks. No API key
 * required for low-volume access (BLS_API_KEY is optional, raises the daily
 * cap from 25 to 500).
 *
 * Headline derivation mirrors FRED — same per-series transforms.
 */

import type { CandidateEvent, EventTypeLiteral } from "./auto-ingest-types";

const BLS_BASE = "https://api.bls.gov/publicAPI/v2/timeseries/data/";

type DisplayMode = "yoy_pct" | "mom_diff_thousands" | "level_pct";

interface BlsSeries {
  id: string;
  display: DisplayMode;
  eventType: EventTypeLiteral;
  metricName: string;
  headlineNoun: string;
}

const BLS_SERIES: ReadonlyArray<BlsSeries> = [
  {
    id: "CUSR0000SA0",
    display: "yoy_pct",
    eventType: "CPI",
    metricName: "BLS CPI-U All Items",
    headlineNoun: "CPI-U",
  },
  {
    id: "CUSR0000SA0L1E",
    display: "yoy_pct",
    eventType: "CPI",
    metricName: "BLS Core CPI-U",
    headlineNoun: "Core CPI-U",
  },
  {
    id: "CES0000000001",
    display: "mom_diff_thousands",
    eventType: "NFP",
    metricName: "BLS Total Nonfarm Payroll",
    headlineNoun: "Total nonfarm payroll",
  },
  {
    id: "LNS14000000",
    display: "level_pct",
    eventType: "NFP",
    metricName: "BLS Unemployment Rate",
    headlineNoun: "Unemployment rate",
  },
];

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

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}

interface OrderedObservation {
  iso: string;
  value: number | null;
}

function sortAscending(data: BlsDatum[]): OrderedObservation[] {
  const out: OrderedObservation[] = [];
  for (const d of data) {
    const iso = periodToIso(d.year, d.period);
    if (!iso) continue;
    out.push({ iso, value: toFloat(d.value) });
  }
  out.sort((a, b) => a.iso.localeCompare(b.iso));
  return out;
}

function deriveHeadline(
  series: BlsSeries,
  index: number,
  obs: OrderedObservation[],
): { value: number; prior: number | null } | null {
  const here = obs[index].value;
  if (here === null) return null;

  switch (series.display) {
    case "yoy_pct": {
      const yearAgo = index - 12;
      if (yearAgo < 0) return null;
      const ya = obs[yearAgo].value;
      if (ya === null || ya === 0) return null;
      const yoy = ((here - ya) / ya) * 100;
      const priorIndex = index - 1;
      const priorYearAgo = index - 13;
      let prior: number | null = null;
      if (priorIndex >= 0 && priorYearAgo >= 0) {
        const pi = obs[priorIndex].value;
        const pya = obs[priorYearAgo].value;
        if (pi !== null && pya !== null && pya !== 0) {
          prior = ((pi - pya) / pya) * 100;
        }
      }
      return {
        value: round1(yoy),
        prior: prior !== null ? round1(prior) : null,
      };
    }
    case "mom_diff_thousands": {
      if (index < 1) return null;
      const last = obs[index - 1].value;
      if (last === null) return null;
      const mom = here - last;
      let prior: number | null = null;
      if (index >= 2) {
        const beforeLast = obs[index - 2].value;
        if (beforeLast !== null) prior = last - beforeLast;
      }
      return {
        value: Math.round(mom),
        prior: prior !== null ? Math.round(prior) : null,
      };
    }
    case "level_pct": {
      const prior = index >= 1 ? obs[index - 1].value : null;
      return {
        value: round2(here),
        prior: prior !== null ? round2(prior) : null,
      };
    }
  }
}

function formatMonth(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function directionVsPrior(
  current: number,
  prior: number | null,
  tolerance: number,
): "above" | "below" | "in line with" {
  if (prior === null) return "in line with";
  const diff = current - prior;
  if (Math.abs(diff) <= tolerance) return "in line with";
  return diff > 0 ? "above" : "below";
}

function makeHeadline(
  series: BlsSeries,
  value: number,
  prior: number | null,
  iso: string,
): string {
  switch (series.display) {
    case "yoy_pct":
      return `${series.headlineNoun} prints ${value.toFixed(1)}% YoY — ${directionVsPrior(value, prior, 0.05)} prior (${formatMonth(iso)})`;
    case "mom_diff_thousands": {
      const sign = value >= 0 ? "+" : "";
      const formatted = `${sign}${value}k`;
      return `${series.headlineNoun} ${formatted} — ${directionVsPrior(value, prior, 5)} prior (${formatMonth(iso)})`;
    }
    case "level_pct":
      return `${series.headlineNoun} ${value.toFixed(2)}% — ${directionVsPrior(value, prior, 0.01)} prior (${formatMonth(iso)})`;
  }
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

  for (const series of BLS_SERIES) {
    opts.log(`[BLS]  Fetching ${series.id} (${series.metricName})…`);
    const merged: BlsDatum[] = [];
    for (let y = sinceYear; y <= endYear; y += CHUNK_YEARS) {
      const chunkEnd = Math.min(y + CHUNK_YEARS - 1, endYear);
      try {
        const payloads = await fetchChunk(
          [series.id],
          y,
          chunkEnd,
          opts.apiKey,
        );
        const payload = payloads.find((p) => p.seriesID === series.id);
        if (payload) merged.push(...payload.data);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        opts.log(`[BLS]  ⚠ ${series.id} ${y}-${chunkEnd}: ${detail}`);
      }
    }
    const ordered = sortAscending(merged);
    opts.log(
      `[BLS]    ${ordered.length} observation${ordered.length === 1 ? "" : "s"} found`,
    );

    for (let i = 0; i < ordered.length; i++) {
      const obs = ordered[i];
      const derived = deriveHeadline(series, i, ordered);
      if (!derived) continue;
      const { value, prior } = derived;
      const occurredAt = new Date(`${obs.iso}T08:30:00-05:00`);
      if (Number.isNaN(occurredAt.getTime())) continue;
      const headline = makeHeadline(series, value, prior, obs.iso);
      yield {
        headline,
        eventType: series.eventType,
        occurredAt,
        sourceUrl: `https://data.bls.gov/timeseries/${series.id}`,
        source: "BLS",
        data: {
          metricName: series.metricName,
          actualValue: value,
          priorValue: prior,
          expectedValue: null,
          surpriseMagnitude:
            prior !== null ? Math.round((value - prior) * 1e4) / 1e4 : null,
          rawActual: obs.value,
        },
      };
    }
  }
}