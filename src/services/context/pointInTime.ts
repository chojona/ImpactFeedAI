/**
 * Minimal point-in-time eligibility for market observations.
 *
 * Full macro revision selection remains Agent 03's responsibility
 * (`revisionSelect.ts` / `quality.ts`). Feature calculators still enforce
 * `availableAt < cutoff` (and SYSTEM_REPLAY `fetchedAt < cutoff`) as defense
 * in depth over already-selected inputs.
 */

import type {
  FeatureReasonCode,
  KnowledgeMode,
  MarketContextObservation,
} from "@/types/context";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Strict cutoff: available only if availableAt is strictly before cutoff. */
export function isAvailableBeforeCutoff(
  availableAt: Date,
  cutoff: Date,
): boolean {
  return availableAt.getTime() < cutoff.getTime();
}

/**
 * Rejects malformed and impossible calendar dates (e.g. 2024-02-30).
 * Requires an exact UTC Y-M-D round-trip — not merely Date.parse success.
 */
export function isValidObservationDate(date: string): boolean {
  if (!ISO_DAY.test(date)) return false;
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

/**
 * Reasons a market observation cannot enter a feature at `cutoff`.
 * Empty array ⇒ eligible for feature math (value still may be null).
 *
 * SYSTEM_REPLAY matches Agent 03: require `fetchedAt < cutoff` (strict).
 */
export function marketObservationIneligibilityReasons(
  observation: MarketContextObservation,
  cutoff: Date,
  knowledgeMode: KnowledgeMode = "PUBLIC_INFORMATION_RECONSTRUCTION",
): FeatureReasonCode[] {
  const reasons: FeatureReasonCode[] = [];

  if (observation.quality === "conflict") {
    reasons.push("conflict_quarantined");
    return reasons;
  }

  if (observation.quality === "missing") {
    reasons.push("no_eligible_observation");
  }

  if (observation.value !== null && !Number.isFinite(observation.value)) {
    reasons.push("non_finite_value");
  }

  if (
    !(observation.availableAt instanceof Date) ||
    !Number.isFinite(observation.availableAt.getTime())
  ) {
    reasons.push("unknown_availability");
  } else if (!isAvailableBeforeCutoff(observation.availableAt, cutoff)) {
    reasons.push("not_available_before_cutoff");
  }

  if (!ISO_DAY.test(observation.observationDate)) {
    reasons.push("missing_observation_date");
  } else if (!isValidObservationDate(observation.observationDate)) {
    reasons.push("impossible_observation_date");
  }

  if (knowledgeMode === "SYSTEM_REPLAY") {
    if (
      !(observation.fetchedAt instanceof Date) ||
      !Number.isFinite(observation.fetchedAt.getTime())
    ) {
      reasons.push("not_known_to_system");
    } else if (observation.fetchedAt.getTime() >= cutoff.getTime()) {
      reasons.push("not_known_to_system");
    }
  }

  return [...new Set(reasons)];
}

export function isMarketObservationEligible(
  observation: MarketContextObservation,
  cutoff: Date,
  knowledgeMode: KnowledgeMode = "PUBLIC_INFORMATION_RECONSTRUCTION",
): boolean {
  if (observation.value === null) return false;
  return (
    marketObservationIneligibilityReasons(observation, cutoff, knowledgeMode)
      .length === 0
  );
}

export interface DateIndexConflict {
  readonly observationDate: string;
  readonly observationIds: readonly string[];
}

export interface SeriesDateIndex {
  readonly byDate: ReadonlyMap<string, MarketContextObservation>;
  readonly conflicts: readonly DateIndexConflict[];
}

/**
 * Index observations by observationDate for one series.
 *
 * Duplicate dates are quarantined (not last-ID-wins): every id on a conflicted
 * date is listed and none of those rows enter `byDate`.
 */
export function indexSeriesByObservationDate(
  observations: readonly MarketContextObservation[],
  seriesKey: string,
): SeriesDateIndex {
  const buckets = new Map<string, MarketContextObservation[]>();
  for (const obs of observations) {
    if (obs.seriesKey !== seriesKey) continue;
    if (obs.quality === "conflict") continue;
    const list = buckets.get(obs.observationDate) ?? [];
    list.push(obs);
    buckets.set(obs.observationDate, list);
  }

  const byDate = new Map<string, MarketContextObservation>();
  const conflicts: DateIndexConflict[] = [];

  for (const [observationDate, rows] of buckets) {
    if (rows.length === 1) {
      byDate.set(observationDate, rows[0]!);
      continue;
    }
    conflicts.push({
      observationDate,
      observationIds: rows.map((row) => row.id).sort(),
    });
  }

  return { byDate, conflicts };
}

/**
 * Eligible observations for a series, sorted ascending by observationDate then id.
 * Conflicted duplicate dates are excluded entirely.
 */
export function selectEligibleMarketObservations(
  observations: readonly MarketContextObservation[],
  seriesKey: string,
  cutoff: Date,
  knowledgeMode: KnowledgeMode = "PUBLIC_INFORMATION_RECONSTRUCTION",
): MarketContextObservation[] {
  const { byDate, conflicts } = indexSeriesByObservationDate(
    observations,
    seriesKey,
  );
  const conflicted = new Set(conflicts.map((c) => c.observationDate));

  return [...byDate.values()]
    .filter(
      (obs) =>
        !conflicted.has(obs.observationDate) &&
        isMarketObservationEligible(obs, cutoff, knowledgeMode),
    )
    .sort((a, b) => {
      const byObsDate = a.observationDate.localeCompare(b.observationDate);
      if (byObsDate !== 0) return byObsDate;
      return a.id.localeCompare(b.id);
    });
}

/** True when the series has any quarantined duplicate observationDate. */
export function seriesHasDateConflicts(
  observations: readonly MarketContextObservation[],
  seriesKey: string,
): boolean {
  return indexSeriesByObservationDate(observations, seriesKey).conflicts.length > 0;
}
