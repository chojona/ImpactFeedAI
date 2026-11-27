import type {
  ContextObservation,
  ObservationQuality,
  PointInTimePolicy,
} from "@/types/context";
import type { MissingReason } from "@/types/context";

export function isHistoricallyQualifiedQuality(
  quality: ObservationQuality,
  allowRevisedLatest: boolean,
): boolean {
  if (quality === "verified_vintage" || quality === "conservative_date_bound") {
    return true;
  }
  if (quality === "revised_latest") return allowRevisedLatest;
  return false;
}

/**
 * Pure eligibility reasons for a single observation under a PIT policy.
 * Does not mutate or invent timestamps.
 */
export function observationEligibilityReasons(
  observation: ContextObservation,
  policy: PointInTimePolicy,
): MissingReason[] {
  const reasons: MissingReason[] = [];

  if (observation.quality === "conflict") {
    reasons.push("conflict_quarantined");
    return reasons;
  }
  if (observation.quality === "missing" || observation.value === null) {
    reasons.push("no_observation_for_period");
  }
  if (observation.quality === "unknown_availability") {
    reasons.push("unknown_availability");
  }
  if (
    observation.quality === "revised_latest" &&
    !policy.allowRevisedLatest
  ) {
    reasons.push("revised_latest_ineligible");
  }
  if (
    observation.value !== null &&
    !Number.isFinite(observation.value)
  ) {
    reasons.push("non_finite_value");
  }

  if (
    !(observation.availableAt instanceof Date) ||
    !Number.isFinite(observation.availableAt.getTime())
  ) {
    if (observation.quality !== "revised_latest") {
      reasons.push("unknown_availability");
    }
  } else if (observation.availableAt.getTime() >= policy.cutoff.getTime()) {
    reasons.push("not_available_before_cutoff");
  }

  if (observation.recordedAt.getTime() > policy.recordedThrough.getTime()) {
    reasons.push("recorded_after_data_freeze");
  }

  if (policy.knowledgeMode === "SYSTEM_REPLAY") {
    if (
      observation.fetchedAt.getTime() >= policy.cutoff.getTime() ||
      observation.recordedAt.getTime() >= policy.cutoff.getTime()
    ) {
      reasons.push("not_known_to_system");
    }
  }

  if (
    policy.requireInitial &&
    observation.valueKind !== "INITIAL_REPORTED"
  ) {
    // Reuse the closest selection reason; first-print research gate.
    reasons.push("no_observation_for_period");
  }

  return [...new Set(reasons)];
}

export function isObservationEligible(
  observation: ContextObservation,
  policy: PointInTimePolicy,
): boolean {
  return observationEligibilityReasons(observation, policy).length === 0;
}
