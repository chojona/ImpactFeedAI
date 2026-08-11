/**
 * FOMC source — emits one event per FOMC rate decision since `since`.
 *
 * Approach: walk daily DFEDTARU (Federal Funds Target Rate upper limit) and
 * detect changes in the effective rate. FRED's observation date is the date the
 * value is effective, not a statement timestamp. Subtracting one calendar day
 * and displaying 14:00 ET is therefore explicitly an inference; it must never
 * be used as a reaction anchor without a separate official-calendar resolver.
 *
 * Tradeoff: this captures every raise/cut but NOT "hold" meetings, since
 * those produce no series change. There is no clean FRED endpoint that
 * enumerates the FOMC meeting calendar — `release_id=82` returns the H.15
 * publication schedule (3 entries since 2023), not meetings. Holds can be
 * added later from a hardcoded calendar if needed; for now, decisions only.
 */

import type { CandidateEvent } from "./auto-ingest-types";
import { METRICS } from "@/services/macro/metrics";
import { fomcStatementTime, utcDateOnly } from "@/services/macro/time";

const FRED_BASE = "https://api.stlouisfed.org/fred";

interface FredObs {
  date: string;
  value: string;
}

interface FredResponse {
  observations?: FredObs[];
}

const toFloat = (v: string): number | null => {
  if (v === "" || v === ".") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function fetchTargetUpper(
  apiKey: string,
  since: string,
): Promise<FredObs[]> {
  const url = new URL(`${FRED_BASE}/series/observations`);
  url.searchParams.set("series_id", "DFEDTARU");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("observation_start", since);
  url.searchParams.set("sort_order", "asc");
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`FRED DFEDTARU HTTP ${res.status}`);
  const json = (await res.json()) as FredResponse;
  return json.observations ?? [];
}

function isoMinusOneDay(iso: string): string | null {
  const d = utcDateOnly(iso);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function formatMonth(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function classifyDelta(
  current: number,
  prior: number,
): { verb: "raises" | "cuts"; bp: number } {
  const bp = Math.round((current - prior) * 100);
  return { verb: bp > 0 ? "raises" : "cuts", bp: Math.abs(bp) };
}

function makeHeadline(
  current: number,
  prior: number,
  meetingIso: string,
): string {
  const { verb, bp } = classifyDelta(current, prior);
  return `Fed ${verb} rates ${bp}bp to ${current.toFixed(2)}% — ${formatMonth(meetingIso)}`;
}

export interface FomcSourceOptions {
  apiKey: string;
  since: string;
  log: (msg: string) => void;
}

export async function* yieldFomcEvents(
  opts: FomcSourceOptions,
): AsyncGenerator<CandidateEvent> {
  opts.log("[FOMC] Fetching DFEDTARU (daily target rate upper limit)…");
  let observations: FredObs[];
  try {
    observations = await fetchTargetUpper(opts.apiKey, opts.since);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    opts.log(`[FOMC] ⚠ ${detail}`);
    return;
  }
  opts.log(`[FOMC]   ${observations.length} daily observation(s) found`);

  let prior: number | null = null;
  let decisions = 0;
  for (const obs of observations) {
    const value = toFloat(obs.value);
    if (value === null) continue;
    if (prior !== null && Math.abs(value - prior) > 1e-6) {
      // Inferred announcement day only; DFEDTARU itself proves neither the
      // announcement date nor the time.
      const meetingIso = isoMinusOneDay(obs.date);
      if (meetingIso === null) {
        prior = value;
        continue;
      }
      const occurredAt = fomcStatementTime(meetingIso); // 14:00 ET, DST-aware
      const releaseDate = utcDateOnly(meetingIso);
      if (
        Number.isNaN(occurredAt.getTime()) ||
        Number.isNaN(releaseDate.getTime())
      ) {
        prior = value;
        continue;
      }
      const { bp } = classifyDelta(value, prior);
      const seriesUrl = "https://fred.stlouisfed.org/series/DFEDTARU";
      yield {
        // The effective-date change is the only identity DFEDTARU proves. Do
        // not key this candidate by the inferred announcement timestamp.
        eventKey: `macro:${METRICS.FED_TARGET_UPPER.key}:change:${obs.date}`,
        headline: makeHeadline(value, prior, meetingIso),
        eventType: "FED_DECISION",
        occurredAt,
        releaseAt: null,
        releaseDate,
        timingStatus: "INFERRED",
        timingSource: "INFERRED_FROM_FRED_DFEDTARU_EFFECTIVE_DATE",
        sourceUrl: seriesUrl,
        source: "FOMC",
        data: {
          metricKey: METRICS.FED_TARGET_UPPER.key,
          metricName: METRICS.FED_TARGET_UPPER.canonicalName,
          referencePeriodStart: null,
          actualValue: Math.round(value * 100) / 100,
          priorValue: Math.round(prior * 100) / 100,
          expectedValue: null,
          // No consensus available from FRED; surpriseMagnitude means
          // (actual − expected) everywhere. The size of the move is still
          // derivable as (actual − prior).
          surpriseMagnitude: null,
          actualSource: "FRED",
          actualSourceUrl: seriesUrl,
          consensusStatus: "MISSING",
          consensusSource: null,
          consensusSourceUrl: null,
          consensusAsOf: null,
          rawActual: bp,
        },
      };
      decisions += 1;
    }
    prior = value;
  }
  opts.log(`[FOMC]   ${decisions} rate decision(s) emitted`);
}
