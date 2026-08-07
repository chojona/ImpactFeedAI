/**
 * FRED fetcher for the CURATED pipeline — resolves the actual and prior values
 * for a hand-curated release event, in the metric's canonical unit.
 *
 * Historical note: this module used to store the *raw* FRED observation
 * (CPIAUCSL ≈ 294.9) as `actualValue` while `events-seed.ts` supplies
 * `expectedValue` as a headline percentage (8.8). The resulting
 * `surpriseMagnitude` was dimensionally meaningless. Both values now come from
 * the shared canonical registry in `metrics.ts`, so curated and bulk
 * ingestion agree on what "CPI" means.
 *
 * Two distinct resolution strategies:
 *
 *   Monthly releases (CPI / PPI / NFP)
 *     The observation whose *reference period* is the latest one on or before
 *     the release date, transformed via the metric's canonical transform.
 *     A CPI print released 2022-07-13 reports on June 2022, whose FRED
 *     observation is dated 2022-06-01 — the last one at or before the release.
 *
 *   Fed decisions (FED_DECISION)
 *     See `resolveFedDecision` below. DFEDTARU changes the day *after* an
 *     announcement, so the naive "last observation on or before the event"
 *     returns the PRE-decision rate.
 */
import {
  CURATED_SERIES_BY_EVENT_TYPE,
  computeSurpriseInCanonicalUnit,
  deriveMetric,
  type CanonicalMetric,
  type Observation,
} from "./metrics";
import type { MacroRelease } from "./types";

const FRED_BASE = "https://api.stlouisfed.org/fred";

/** Days after an announcement within which a target-rate change is attributed to it. */
const FED_EFFECTIVE_WINDOW_DAYS = 7;

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
  start: Date,
  end: Date,
  apiKey: string,
  /**
   * Vintage date. When set, FRED (ALFRED) returns the series **as it was
   * published on that date**, before any later revision.
   *
   * This matters: macro series are revised, sometimes heavily. January 2023
   * payrolls printed +517k on 2023-02-03 — the number the market actually
   * traded — but benchmark revisions have since restated it to +434k. Computing
   * `surprise = actual − consensus` against the revised figure measures a
   * surprise nobody experienced. Verified against both vintages before adopting.
   */
  vintage?: Date,
): Promise<Observation[] | null> {
  const url = new URL(`${FRED_BASE}/series/observations`);
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("observation_start", isoDate(start));
  url.searchParams.set("observation_end", isoDate(end));
  url.searchParams.set("sort_order", "asc");
  if (vintage) {
    const v = isoDate(vintage);
    url.searchParams.set("realtime_start", v);
    url.searchParams.set("realtime_end", v);
  }

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      console.warn(`  ⚠ FRED ${seriesId}: HTTP ${res.status}`);
      return null;
    }
    const json = (await res.json()) as FredResponse;
    return (json.observations ?? []).map((o) => ({
      iso: o.date,
      value: toFloat(o.value),
    }));
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn(`  ⚠ FRED ${seriesId}: ${detail}`);
    return null;
  }
}

/** Index of the last observation whose date is on or before `when`. Daily series. */
function indexAtOrBefore(obs: readonly Observation[], when: Date): number {
  const cutoff = isoDate(when);
  let found = -1;
  for (let i = 0; i < obs.length; i++) {
    if (obs[i].iso <= cutoff) found = i;
    else break;
  }
  return found;
}

/**
 * Index of the observation a release published on `releaseDate` reports on.
 *
 * FRED stamps an observation with its **reference period**, not its
 * publication date: June 2022 CPI is dated 2022-06-01 but was published
 * 2022-07-13. Selecting "the last observation on or before the release date"
 * therefore picks the WRONG month — 2022-07-01 is also ≤ 2022-07-13, so the
 * June print resolves to July's figure (which had not been published yet).
 * That off-by-one produced 8.5% for an event headlined "June CPI hits 9.1%".
 *
 * A monthly release published in month M reports on a period ending before M
 * begins, so the correct observation is the last one strictly before the first
 * day of the release month. The same rule resolves quarterly series correctly
 * (a Q1 GDP estimate published in April selects the observation dated Jan 1).
 */
function indexOfReferencePeriod(
  obs: readonly Observation[],
  releaseDate: Date,
): number {
  const y = releaseDate.getUTCFullYear();
  const m = String(releaseDate.getUTCMonth() + 1).padStart(2, "0");
  const firstOfReleaseMonth = `${y}-${m}-01`;

  let found = -1;
  for (let i = 0; i < obs.length; i++) {
    if (obs[i].iso < firstOfReleaseMonth) found = i;
    else break;
  }
  return found;
}

/**
 * Resolve a Fed decision into pre- and post-decision target rates.
 *
 * DFEDTARU is a daily series carrying the target upper bound in force on each
 * calendar day. A decision announced at 14:00 ET on day D takes effect on the
 * following business day, so the series still shows the OLD rate on D itself.
 *
 *   priorValue  = the rate in force on the announcement day  (pre-decision)
 *   actualValue = the rate in force after the decision takes effect
 *
 * Rather than assuming a fixed D+1 offset — which breaks across weekends and
 * holidays — we scan forward up to FED_EFFECTIVE_WINDOW_DAYS for the first
 * value that differs from the announcement-day rate. If none differs, the
 * meeting was a HOLD and actual === prior, which is the correct semantics: the
 * decision was to leave the target unchanged.
 */
export function resolveFedDecision(
  obs: readonly Observation[],
  announcedAt: Date,
): { prior: number; actual: number } | null {
  const atOrBefore = indexAtOrBefore(obs, announcedAt);
  if (atOrBefore < 0) return null;
  const prior = obs[atOrBefore].value;
  if (prior === null) return null;

  const deadline = new Date(announcedAt.getTime());
  deadline.setUTCDate(deadline.getUTCDate() + FED_EFFECTIVE_WINDOW_DAYS);
  const deadlineIso = isoDate(deadline);

  for (let i = atOrBefore + 1; i < obs.length; i++) {
    if (obs[i].iso > deadlineIso) break;
    const v = obs[i].value;
    if (v === null) continue;
    if (Math.abs(v - prior) > 1e-9) {
      return { prior: round2(prior), actual: round2(v) };
    }
  }

  // No change within the window → a hold.
  return { prior: round2(prior), actual: round2(prior) };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Returns null when the event type has no canonical series mapping or the
 * fetch failed. The caller may still insert a DataRelease built from a manual
 * expectedValue alone.
 */
export async function fetchMacroRelease(
  input: MacroFetchInput,
): Promise<MacroRelease | null> {
  const binding = CURATED_SERIES_BY_EVENT_TYPE[
    input.eventType as keyof typeof CURATED_SERIES_BY_EVENT_TYPE
  ];
  if (!binding) return null;

  const metric: CanonicalMetric = binding.metric;
  const metricName = input.metricNameOverride ?? metric.canonicalName;

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    // Still emit an expected-only row if the curator supplied consensus.
    if (input.expectedValue === null) return null;
    return {
      metricName,
      actualValue: null,
      priorValue: null,
      expectedValue: input.expectedValue,
      surpriseMagnitude: null,
    };
  }

  const isFed = metric.eventType === "FED_DECISION";

  // Fed: a short daily window around the meeting is enough.
  // Monthly series: 36 months of history so a YoY transform (needs 13 prior
  // observations) always has enough runway.
  const start = new Date(input.occurredAt.getTime());
  const end = new Date(input.occurredAt.getTime());
  if (isFed) {
    start.setUTCDate(start.getUTCDate() - 30);
    end.setUTCDate(end.getUTCDate() + FED_EFFECTIVE_WINDOW_DAYS + 1);
  } else {
    start.setUTCMonth(start.getUTCMonth() - 36);
  }

  // Vintage applies to monthly release series only.
  //
  // It must NOT be used for the Fed path: `resolveFedDecision` deliberately
  // looks *forward* for the post-decision rate, and a snapshot taken as of the
  // announcement date cannot contain the next day's observation. The target
  // rate is never revised, so the current vintage is correct there anyway.
  let obs = await fetchFredSeries(
    binding.seriesId,
    start,
    end,
    apiKey,
    isFed ? undefined : input.occurredAt,
  );

  // ALFRED vintage coverage does not reach back indefinitely. Fall back to the
  // current vintage rather than dropping the release entirely.
  if (!isFed && (!obs || obs.length === 0)) {
    console.warn(
      `  ⚠ FRED ${binding.seriesId}: no vintage data as of ${isoDate(input.occurredAt)} — falling back to current vintage (values may be revised)`,
    );
    obs = await fetchFredSeries(binding.seriesId, start, end, apiKey);
  }
  if (!obs || obs.length === 0) return null;

  let actualValue: number | null = null;
  let priorValue: number | null = null;

  if (isFed) {
    const resolved = resolveFedDecision(obs, input.occurredAt);
    if (resolved) {
      priorValue = resolved.prior;
      actualValue = resolved.actual;
    }
  } else {
    const idx = indexOfReferencePeriod(obs, input.occurredAt);
    if (idx >= 0) {
      const derived = deriveMetric(metric.transform, idx, obs);
      if (derived) {
        actualValue = derived.value;
        priorValue = derived.prior;
      }
    }
  }

  if (actualValue === null && input.expectedValue === null) return null;

  return {
    metricName,
    actualValue,
    priorValue,
    expectedValue: input.expectedValue,
    // Both sides are now in the metric's canonical unit.
    surpriseMagnitude: computeSurpriseInCanonicalUnit(
      actualValue,
      input.expectedValue,
    ),
  };
}
