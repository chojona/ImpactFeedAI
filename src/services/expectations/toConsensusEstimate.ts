import {
  validateConsensusEstimate,
  type ConsensusEstimate,
} from "@/services/macro/consensus";
import { isEligibleStreetSurpriseInput } from "@/services/expectations/validate";
import type { ExpectationObservation } from "@/types/expectations";

/**
 * Convert an expectation into the legacy ConsensusEstimate shape used by
 * DataRelease provenance — only for VERIFIED pre-release SURVEY_CONSENSUS.
 * Nowcasts, SPF and market-implied never cross this bridge.
 */
export function toConsensusEstimate(
  observation: ExpectationObservation,
  releaseAt: Date | null,
): ConsensusEstimate | null {
  if (!isEligibleStreetSurpriseInput(observation, releaseAt)) {
    return null;
  }
  if (observation.value === null || !observation.asOf) {
    return null;
  }
  return validateConsensusEstimate(
    {
      value: observation.value,
      asOf: observation.asOf,
      source: observation.source,
      sourceUrl: observation.sourceUrl,
    },
    releaseAt,
  );
}
