/**
 * FRED source — yields one candidate Event per observation.
 *
 * FRED stores raw index levels (CPIAUCSL = 296.5, PAYEMS = 159000 thousand).
 * News headlines speak in derived metrics (CPI YoY %, NFP MoM change). The
 * conversion, the canonical metric name and the stored unit all come from
 * `metrics.ts`, which the curated pipeline shares — so "CPI" means the same
 * thing regardless of which pipeline produced the row.
 */

import type { CandidateEvent } from "./auto-ingest-types";
import {
  FRED_SERIES_BINDINGS,
  computeSurpriseInCanonicalUnit,
  deriveMetric,
  makeMetricHeadline,
  type Observation,
} from "./metrics";

const FRED_BASE = "https://api.stlouisfed.org/fred";

interface FredObservation {
  date: string;
  value: string;
}

interface FredResponse {
  observations?: FredObservation[];
}

const toFloat = (v: string): number | null => {
  if (v === "" || v === ".") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function fetchObservations(
  seriesId: string,
  apiKey: string,
  since: string,
): Promise<Observation[]> {
  const url = new URL(`${FRED_BASE}/series/observations`);
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("observation_start", since);
  url.searchParams.set("sort_order", "asc");
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`FRED ${seriesId}: HTTP ${res.status}`);
  }
  const json = (await res.json()) as FredResponse;
  return (json.observations ?? []).map((o) => ({
    iso: o.date,
    value: toFloat(o.value),
  }));
}

export interface FredSourceOptions {
  apiKey: string;
  since: string; // ISO date
  log: (msg: string) => void;
}

export async function* yieldFredEvents(
  opts: FredSourceOptions,
): AsyncGenerator<CandidateEvent> {
  for (const binding of FRED_SERIES_BINDINGS) {
    const { seriesId, metric } = binding;
    opts.log(`[FRED] Fetching ${seriesId} (${metric.canonicalName})…`);

    let observations: Observation[];
    try {
      observations = await fetchObservations(seriesId, opts.apiKey, opts.since);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      opts.log(`[FRED] ⚠ ${seriesId}: ${detail}`);
      continue;
    }
    opts.log(
      `[FRED]   ${observations.length} observation${observations.length === 1 ? "" : "s"} found`,
    );

    for (let i = 0; i < observations.length; i++) {
      const obs = observations[i];
      const derived = deriveMetric(metric.transform, i, observations);
      if (!derived) continue;

      const occurredAt = new Date(`${obs.iso}T08:30:00-05:00`); // 8:30 ET
      if (Number.isNaN(occurredAt.getTime())) continue;

      yield {
        headline: makeMetricHeadline(metric, derived.value, derived.prior, obs.iso),
        eventType: metric.eventType,
        occurredAt,
        sourceUrl: `https://fred.stlouisfed.org/series/${seriesId}`,
        source: "FRED",
        metricKey: metric.key,
        data: {
          metricName: metric.canonicalName,
          actualValue: derived.value,
          priorValue: derived.prior,
          // FRED publishes no consensus, so there is nothing to be surprised
          // against. surpriseMagnitude means (actual − expected) everywhere;
          // the change vs prior stays derivable as (actual − prior).
          expectedValue: null,
          surpriseMagnitude: computeSurpriseInCanonicalUnit(derived.value, null),
          rawActual: obs.value,
        },
      };
    }
  }
}
