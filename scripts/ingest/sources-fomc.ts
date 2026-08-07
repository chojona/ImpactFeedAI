/**
 * FOMC source — emits one event per FOMC rate decision since `since`.
 *
 * Approach: walk daily DFEDTARU (Federal Funds Target Rate upper limit). This
 * series step-changes only on FOMC decision days, with the new rate taking
 * effect the *day after* the announcement. We subtract one calendar day from
 * the change date to recover the announcement date, then stamp it 14:00 ET.
 *
 * Tradeoff: this captures every raise/cut but NOT "hold" meetings, since
 * those produce no series change. There is no clean FRED endpoint that
 * enumerates the FOMC meeting calendar — `release_id=82` returns the H.15
 * publication schedule (3 entries since 2023), not meetings. Holds can be
 * added later from a hardcoded calendar if needed; for now, decisions only.
 */

import type { CandidateEvent } from "./auto-ingest-types";

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

function isoMinusOneDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
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
      // Decision day = previous business day.
      const meetingIso = isoMinusOneDay(obs.date);
      const occurredAt = new Date(`${meetingIso}T14:00:00-05:00`); // 2pm ET
      if (Number.isNaN(occurredAt.getTime())) {
        prior = value;
        continue;
      }
      const { bp } = classifyDelta(value, prior);
      yield {
        headline: makeHeadline(value, prior, meetingIso),
        eventType: "FED_DECISION",
        occurredAt,
        sourceUrl: `https://www.federalreserve.gov/newsevents/pressreleases/monetary${meetingIso.replace(/-/g, "")}a.htm`,
        source: "FOMC",
        data: {
          metricName: "Federal Funds Rate target upper bound",
          actualValue: Math.round(value * 100) / 100,
          priorValue: Math.round(prior * 100) / 100,
          expectedValue: null,
          surpriseMagnitude: Math.round((value - prior) * 1e4) / 1e4,
          rawActual: bp,
        },
      };
      decisions += 1;
    }
    prior = value;
  }
  opts.log(`[FOMC]   ${decisions} rate decision(s) emitted`);
}