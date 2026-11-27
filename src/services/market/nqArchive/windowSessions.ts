/**
 * Per-trading-date checks for every session an event window touches.
 *
 * Eligibility, causal contract selection and the certified session grid are
 * required for EVERY touched date, not only the release date. A window whose
 * dates resolve to different contracts crosses a roll and is refused — the
 * adapter never stitches two contracts together.
 */
import type { NqEligibilityIndex } from "./eligibility";
import { selectContractAsOf } from "./rolls";
import { sessionMinuteCount } from "./sessionGrid";
import type {
  NqReactionQualification,
  NqRollBoundary,
  NqSessionEligibility,
  NqWindowSession,
} from "./types";

const RANK: Readonly<Record<NqReactionQualification, number>> = {
  refused: 0,
  exploratory: 1,
  strict: 2,
};

export const weakestQualification = (
  qualifications: readonly NqReactionQualification[],
): NqReactionQualification =>
  qualifications.reduce<NqReactionQualification>(
    (weakest, q) => (RANK[q] < RANK[weakest] ? q : weakest),
    "strict",
  );

export function describeWindowSession(args: {
  tradingDate: string;
  eligibility: NqSessionEligibility;
  index: NqEligibilityIndex;
  rolls: readonly NqRollBoundary[];
}): NqWindowSession {
  const { tradingDate, eligibility, index, rolls } = args;
  const selection = selectContractAsOf(
    rolls,
    tradingDate,
    eligibility.selectedContract ?? index.certificationContract(tradingDate),
  );
  const expectedActiveMinutes = index.expectedActiveMinutes(tradingDate);
  return {
    tradingDate,
    qualification: eligibility.qualification,
    reasonCode: eligibility.reasonCode,
    contract: selection.contract,
    conflictsWithCertification: selection.conflictsWithCertification,
    expectedActiveMinutes,
    modelledActiveMinutes:
      expectedActiveMinutes === null
        ? null
        : sessionMinuteCount(tradingDate, index.tradingCalendar),
  };
}

/** Refusal reasons contributed by the touched sessions. */
export function windowSessionRefusals(args: {
  sessions: readonly NqWindowSession[];
  releaseTradingDate: string;
  releaseContract: string;
}): string[] {
  const reasons: string[] = [];
  for (const session of args.sessions) {
    if (session.tradingDate !== args.releaseTradingDate) {
      if (session.qualification === "refused") {
        reasons.push("WINDOW_SESSION_NOT_ELIGIBLE");
      }
      if (session.conflictsWithCertification) {
        reasons.push("CONTRACT_CERTIFICATION_CONFLICT");
      }
      if (session.contract !== args.releaseContract) {
        reasons.push("WINDOW_CROSSES_CONTRACT_ROLL");
      }
    }
    if (
      session.expectedActiveMinutes !== null &&
      session.expectedActiveMinutes !== session.modelledActiveMinutes
    ) {
      reasons.push("SESSION_GRID_MISMATCH_CERTIFICATION");
    }
  }
  return reasons;
}
