/**
 * FRED source — yields one candidate Event per observation.
 *
 * FRED stores raw index levels (CPIAUCSL = 296.5, PAYEMS = 159000 thousand).
 * News headlines speak in derived metrics (CPI YoY %, NFP MoM change). The
 * conversion, the canonical metric name and the stored unit all come from
 * `metrics.ts`, which the curated pipeline shares — so "CPI" means the same
 * thing regardless of which pipeline produced the row.
 */

import {
  macroInitialEventKey,
  type CandidateEvent,
} from "./auto-ingest-types";
import {
  FRED_SERIES_BINDINGS,
  computeSurpriseInCanonicalUnit,
  deriveMetric,
  makeMetricHeadline,
  observationStartFor,
  type Observation,
} from "@/services/macro/metrics";
import { utcDateOnly } from "@/services/macro/time";

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

    // Fetch further back than `since` so the first requested period is actually
    // derivable — a YoY transform needs 13 prior observations. Candidates before
    // `since` are dropped by the orchestrator.
    let observations: Observation[];
    try {
      observations = await fetchObservations(
        seriesId,
        opts.apiKey,
        observationStartFor(metric, opts.since),
      );
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

      // FRED's observation `date` is the period the value measures. This
      // endpoint does not return the historical publication timestamp, so keep
      // the reference day only as a UTC display/order fallback and fail closed
      // for reaction timing.
      const referencePeriodStart = utcDateOnly(obs.iso);
      if (Number.isNaN(referencePeriodStart.getTime())) continue;
      const seriesUrl = `https://fred.stlouisfed.org/series/${seriesId}`;

      yield {
        eventKey: macroInitialEventKey(metric.key, obs.iso),
        headline: makeMetricHeadline(metric, derived.value, derived.prior, obs.iso),
        eventType: metric.eventType,
        occurredAt: referencePeriodStart,
        releaseAt: null,
        releaseDate: null,
        timingStatus: "REFERENCE_PERIOD_ONLY",
        timingSource: "FRED_OBSERVATION_DATE",
        sourceUrl: seriesUrl,
        source: "FRED",
        data: {
          metricKey: metric.key,
          metricName: metric.canonicalName,
          referencePeriodStart,
          actualValue: derived.value,
          priorValue: derived.prior,
          // FRED publishes no consensus, so there is nothing to be surprised
          // against. surpriseMagnitude means (actual − expected) everywhere;
          // the change vs prior stays derivable as (actual − prior).
          expectedValue: null,
          surpriseMagnitude: computeSurpriseInCanonicalUnit(derived.value, null),
          actualSource: "FRED",
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
