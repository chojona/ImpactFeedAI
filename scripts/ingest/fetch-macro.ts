/**
 * FRED API wrapper — fetches the actual + prior values for a data release.
 *
 * FRED does not ship consensus estimates, so `expectedValue` must be hand-
 * curated in events-seed.ts. This module is responsible only for `actual` and
 * `prior`. Returns null when:
 *   - No FRED series is mapped for the event type
 *   - FRED_API_KEY is missing
 *   - The HTTP call fails
 *   - The series has no observation on or before the event date
 */
import type { MacroRelease } from "./types";
import { computeSurprise } from "./compute-reactions";

const FRED_BASE = "https://api.stlouisfed.org/fred";

const SERIES_MAP: Record<string, { id: string; defaultName: string }> = {
  CPI: { id: "CPIAUCSL", defaultName: "CPI YoY" },
  PPI: { id: "PPIACO", defaultName: "PPI YoY" },
  NFP: { id: "PAYEMS", defaultName: "Nonfarm payrolls" },
  FED_DECISION: {
    id: "DFEDTARU",
    defaultName: "Fed Funds Rate target upper bound",
  },
};

interface FredObservation {
  date: string;
  value: string;
}

interface FredResponse {
  observations?: FredObservation[];
}

export interface MacroFetchInput {
  eventType: string;
  occurredAt: Date;
  expectedValue: number | null;
  metricNameOverride: string | null;
}

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

const toFloat = (v: string): number | null => {
  if (v === "" || v === ".") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function fetchFredSeries(
  seriesId: string,
  end: Date,
  apiKey: string,
): Promise<FredObservation[] | null> {
  // Pull 18 months back to be sure we have at least a "prior" observation for
  // monthly series, even with FRED revisions.
  const start = new Date(end.getTime() - 540 * 24 * 60 * 60 * 1000);
  const url = new URL(`${FRED_BASE}/series/observations`);
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("observation_start", isoDate(start));
  url.searchParams.set("observation_end", isoDate(end));
  url.searchParams.set("sort_order", "asc");

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      console.warn(`  ⚠ FRED ${seriesId}: HTTP ${res.status}`);
      return null;
    }
    const json = (await res.json()) as FredResponse;
    return json.observations ?? [];
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn(`  ⚠ FRED ${seriesId}: ${detail}`);
    return null;
  }
}

/**
 * Returns null when the event type has no FRED mapping or fetching failed.
 * Caller decides whether to still insert a DataRelease row from the manual
 * expectedValue alone.
 */
export async function fetchMacroRelease(
  input: MacroFetchInput,
): Promise<MacroRelease | null> {
  const mapping = SERIES_MAP[input.eventType];
  if (!mapping) return null;

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    // Caller still wants expected-only releases if the user curated one.
    if (input.expectedValue === null) return null;
    return {
      metricName: input.metricNameOverride ?? mapping.defaultName,
      actualValue: null,
      priorValue: null,
      expectedValue: input.expectedValue,
      surpriseMagnitude: null,
    };
  }

  const obs = await fetchFredSeries(mapping.id, input.occurredAt, apiKey);
  if (!obs || obs.length === 0) return null;

  // The release covers the most recent month/period ending on/before the
  // event date. FRED stamps observations with the *reference* date, not the
  // release date, so we want the last observation in our window.
  const sorted = [...obs].sort((a, b) => a.date.localeCompare(b.date));
  const actualObs = sorted[sorted.length - 1];
  const priorObs = sorted.length >= 2 ? sorted[sorted.length - 2] : null;

  const actualValue = toFloat(actualObs.value);
  const priorValue = priorObs ? toFloat(priorObs.value) : null;

  return {
    metricName: input.metricNameOverride ?? mapping.defaultName,
    actualValue,
    priorValue,
    expectedValue: input.expectedValue,
    surpriseMagnitude: computeSurprise(actualValue, input.expectedValue),
  };
}