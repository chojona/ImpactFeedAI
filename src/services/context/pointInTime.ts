/**
 * Minimal point-in-time eligibility for market observations.
 *
 * Full macro revision selection remains Agent 03's responsibility
 * (`observationEligibilityReasons` / vintage selection). Feature calculators
 * still enforce `availableAt < cutoff` as defense in depth over already-selected
 * inputs.
 */

import type {
  FeatureReasonCode,
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

export function isValidObservationDate(date: string): boolean {
  if (!ISO_DAY.test(date)) return false;
  const parsed = Date.parse(`${date}T00:00:00.000Z`);
  return Number.isFinite(parsed);
}

/**
 * Reasons a market observation cannot enter a feature at `cutoff`.
 * Empty array ⇒ eligible for feature math (value still may be null).
 */
export function marketObservationIneligibilityReasons(
  observation: MarketContextObservation,
  cutoff: Date,
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

  if (!isValidObservationDate(observation.observationDate)) {
    reasons.push("missing_observation_date");
  }

  return [...new Set(reasons)];
}

export function isMarketObservationEligible(
  observation: MarketContextObservation,
  cutoff: Date,
): boolean {
  if (observation.value === null) return false;
  return marketObservationIneligibilityReasons(observation, cutoff).length === 0;
}

/**
 * Eligible observations for a series, sorted ascending by observationDate then id.
 * Does not invent missing sessions.
 */
export function selectEligibleMarketObservations(
  observations: readonly MarketContextObservation[],
  seriesKey: string,
  cutoff: Date,
): MarketContextObservation[] {
  return observations
    .filter(
      (obs) =>
        obs.seriesKey === seriesKey &&
        isMarketObservationEligible(obs, cutoff),
    )
    .sort((a, b) => {
      const byDate = a.observationDate.localeCompare(b.observationDate);
      if (byDate !== 0) return byDate;
      return a.id.localeCompare(b.id);
    });
}
