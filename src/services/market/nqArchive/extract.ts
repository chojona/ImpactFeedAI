/**
 * Pure event-window extraction over an injected bar store + manifests.
 */
import { buildCoverageReport, releaseMinuteOpen } from "./coverage";
import type { NqEligibilityIndex } from "./eligibility";
import { selectContractAsOf } from "./rolls";
import { tradingDateForReleaseAt } from "./tradingDate";
import type {
  NqArchiveProvenance,
  NqBarStore,
  NqEventWindowRequest,
  NqEventWindowResult,
  NqReactionQualification,
  NqRollBoundary,
} from "./types";

export interface ExtractContext {
  readonly rolls: readonly NqRollBoundary[];
  readonly eligibility: NqEligibilityIndex;
  readonly bars: NqBarStore;
  readonly provenance: NqArchiveProvenance;
}

export async function extractEventWindow(
  ctx: ExtractContext,
  request: NqEventWindowRequest,
): Promise<NqEventWindowResult> {
  const { releaseAt, beforeMs, afterMs } = request;
  if (!(releaseAt instanceof Date) || !Number.isFinite(releaseAt.getTime())) {
    throw new TypeError("releaseAt must be a finite Date");
  }
  if (!Number.isFinite(beforeMs) || beforeMs < 0) {
    throw new TypeError("beforeMs must be a non-negative finite number");
  }
  if (!Number.isFinite(afterMs) || afterMs < 0) {
    throw new TypeError("afterMs must be a non-negative finite number");
  }

  const tradingDate = tradingDateForReleaseAt(releaseAt);
  const eligibility = ctx.eligibility.lookup(tradingDate);
  const certificationContract =
    eligibility.selectedContract ??
    ctx.eligibility.certificationContract(tradingDate);

  const contractSelection = selectContractAsOf(
    ctx.rolls,
    tradingDate,
    certificationContract,
  );

  let reactionQualification: NqReactionQualification =
    eligibility.qualification;
  let reasonCode = eligibility.reasonCode;

  // A certification conflict means we cannot trust the causal selection for a
  // qualified measurement — force refusal without inventing a substitute.
  if (contractSelection.conflictsWithCertification) {
    reactionQualification = "refused";
    reasonCode = "CONTRACT_CERTIFICATION_CONFLICT";
  }

  const windowStart = new Date(releaseAt.getTime() - beforeMs);
  const windowEnd = new Date(releaseAt.getTime() + afterMs);

  // Align to minute opens so the release minute is included when afterMs >= 0.
  const queryStart = releaseMinuteOpen(windowStart);
  const queryEnd = releaseMinuteOpen(windowEnd);

  const bars = await ctx.bars.queryWithinContract({
    contract: contractSelection.contract,
    startInclusive: queryStart,
    endInclusive: queryEnd,
  });

  const coverage = buildCoverageReport({
    windowStart: queryStart,
    windowEnd: queryEnd,
    selectedContract: contractSelection.contract,
    bars,
  });

  // Incomplete requested grids cannot enter strict qualification. Exploratory
  // remains labelled exploratory so callers can still inspect gaps.
  if (reactionQualification === "strict" && !coverage.complete) {
    reactionQualification = "refused";
    reasonCode = "INCOMPLETE_EVENT_WINDOW";
  }

  return {
    releaseAt,
    tradingDate,
    contractSelection,
    eligibility: {
      ...eligibility,
      reasonCode,
      qualification: reactionQualification,
    },
    bars,
    coverage,
    provenance: ctx.provenance,
    reactionQualification,
  };
}
