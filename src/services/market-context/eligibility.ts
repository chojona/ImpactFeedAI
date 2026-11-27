/**
 * Adapter-side eligibility helpers for Agent 03 / Agent 06 selectors.
 *
 * These mirror the strict cutoffs those modules enforce; they do not replace
 * full PIT revision selection.
 */

import type {
  FeatureReasonCode,
  KnowledgeMode,
  MarketContextObservation,
} from "@/types/context";
import type { HistoricalReconstructionStatus } from "@/services/market-context/types";

export function historicalReconstructionStatusForQuality(
  quality: MarketContextObservation["quality"],
): HistoricalReconstructionStatus {
  if (quality === "missing") return "ineligible_missing";
  if (quality === "revised_latest") return "ineligible_revised_latest";
  if (quality === "unknown_availability" || quality === undefined) {
    return "ineligible_unknown_availability";
  }
  if (quality === "conflict") return "ineligible_unknown_availability";
  return "eligible";
}

export function isEligibleForHistoricalReconstruction(
  observation: MarketContextObservation,
): boolean {
  return (
    historicalReconstructionStatusForQuality(observation.quality) === "eligible" &&
    observation.availableAt instanceof Date &&
    Number.isFinite(observation.availableAt.getTime()) &&
    observation.value !== null
  );
}

/**
 * SYSTEM_REPLAY gate aligned with Agent 03 / Agent 06:
 * require `fetchedAt < cutoff` (strict). Missing fetchedAt ⇒ not_known_to_system.
 */
export function systemReplayIneligibilityReasons(
  observation: MarketContextObservation,
  cutoff: Date,
): FeatureReasonCode[] {
  if (
    !(observation.fetchedAt instanceof Date) ||
    !Number.isFinite(observation.fetchedAt.getTime())
  ) {
    return ["not_known_to_system"];
  }
  if (observation.fetchedAt.getTime() >= cutoff.getTime()) {
    return ["not_known_to_system"];
  }
  return [];
}

export function isEligibleForSystemReplay(
  observation: MarketContextObservation,
  cutoff: Date,
): boolean {
  return systemReplayIneligibilityReasons(observation, cutoff).length === 0;
}

export function availabilityIneligibilityReasons(
  observation: MarketContextObservation,
  cutoff: Date,
): FeatureReasonCode[] {
  if (observation.quality === "revised_latest") {
    return ["revised_latest_ineligible"];
  }
  if (
    !(observation.availableAt instanceof Date) ||
    !Number.isFinite(observation.availableAt.getTime())
  ) {
    return ["unknown_availability"];
  }
  if (observation.availableAt.getTime() >= cutoff.getTime()) {
    return ["not_available_before_cutoff"];
  }
  return [];
}

/**
 * Combined gate for a knowledge mode. Feature math still owns its own filters;
 * this exists so adapter tests can assert the shared contract.
 */
export function adapterObservationIneligibilityReasons(
  observation: MarketContextObservation,
  cutoff: Date,
  knowledgeMode: KnowledgeMode,
): FeatureReasonCode[] {
  const reasons: FeatureReasonCode[] = [];
  if (observation.quality === "conflict") return ["conflict_quarantined"];
  if (observation.quality === "missing" || observation.value === null) {
    reasons.push("no_eligible_observation");
  }
  reasons.push(...availabilityIneligibilityReasons(observation, cutoff));
  if (knowledgeMode === "SYSTEM_REPLAY") {
    reasons.push(...systemReplayIneligibilityReasons(observation, cutoff));
  }
  return [...new Set(reasons)];
}
