/**
 * Pure event-window extraction over an injected bar store + manifests.
 *
 * Every check that fails adds an explicit reason; any reason refuses the
 * window. Bars are still returned for inspection, but callers must not
 * promote a refused window to a qualified reaction.
 */
import { selectEndpointAtOrAfter, selectPreReleaseAnchor } from "./anchor";
import { buildCoverageReport } from "./coverage";
import type { NqEligibilityIndex } from "./eligibility";
import { selectContractAsOf } from "./rolls";
import {
  ceilUtcMinute,
  createTradingDateResolver,
  utcMinuteOpen,
} from "./tradingDate";
import type {
  NqArchiveProvenance,
  NqBarStore,
  NqEventWindowRequest,
  NqEventWindowResult,
  NqReactionQualification,
  NqRollBoundary,
} from "./types";
import {
  describeWindowSession,
  weakestQualification,
  windowSessionRefusals,
} from "./windowSessions";

export interface ExtractContext {
  readonly rolls: readonly NqRollBoundary[];
  readonly eligibility: NqEligibilityIndex;
  readonly bars: NqBarStore;
  readonly provenance: NqArchiveProvenance;
}

const validateRequest = ({ releaseAt, beforeMs, afterMs }: NqEventWindowRequest) => {
  if (!(releaseAt instanceof Date) || !Number.isFinite(releaseAt.getTime())) {
    throw new TypeError("releaseAt must be a finite Date");
  }
  if (!Number.isFinite(beforeMs) || beforeMs < 0) {
    throw new TypeError("beforeMs must be a non-negative finite number");
  }
  if (!Number.isFinite(afterMs) || afterMs < 0) {
    throw new TypeError("afterMs must be a non-negative finite number");
  }
};

export async function extractEventWindow(
  ctx: ExtractContext,
  request: NqEventWindowRequest,
): Promise<NqEventWindowResult> {
  validateRequest(request);
  const { releaseAt, beforeMs, afterMs } = request;
  const index = ctx.eligibility;
  const resolveTradingDate = createTradingDateResolver(index.tradingCalendar);

  const release = resolveTradingDate(releaseAt);
  const tradingDate = release.tradingDate;
  const eligibility = index.lookup(tradingDate);
  const contractSelection = selectContractAsOf(
    ctx.rolls,
    tradingDate,
    eligibility.selectedContract ?? index.certificationContract(tradingDate),
  );
  const contract = contractSelection.contract;

  // The grid runs to the first minute open at or after the target instant so
  // the endpoint bar is inside the queried range.
  const targetAt = new Date(releaseAt.getTime() + afterMs);
  const gridStart = utcMinuteOpen(new Date(releaseAt.getTime() - beforeMs));
  const gridEnd = ceilUtcMinute(targetAt);

  const bars = await ctx.bars.queryWithinContract({
    contract,
    startInclusive: gridStart,
    endInclusive: gridEnd,
  });
  const coverage = buildCoverageReport({
    windowStart: gridStart,
    windowEnd: gridEnd,
    selectedContract: contract,
    bars,
  });

  const touchedDates = new Set([tradingDate]);
  const minuteRefusals: string[] = [];
  for (const open of coverage.expectedOpenAts) {
    const resolved = resolveTradingDate(open);
    touchedDates.add(resolved.tradingDate);
    if (resolved.refusalReason) minuteRefusals.push(resolved.refusalReason);
  }
  const sessionDates = [...touchedDates].sort().map((date) =>
    describeWindowSession({
      tradingDate: date,
      eligibility: date === tradingDate ? eligibility : index.lookup(date),
      index,
      rolls: ctx.rolls,
    }),
  );

  const contractBars = bars.filter((bar) => bar.contract === contract);
  const reasons = [
    ...(eligibility.qualification === "refused"
      ? [eligibility.reasonCode ?? "SESSION_NOT_ELIGIBLE"]
      : []),
    ...ctx.provenance.artifactRefusalReasons,
    ...(release.refusalReason ? [release.refusalReason] : []),
    ...minuteRefusals,
    ...(contractSelection.conflictsWithCertification
      ? ["CONTRACT_CERTIFICATION_CONFLICT"]
      : []),
    ...windowSessionRefusals({
      sessions: sessionDates,
      releaseTradingDate: tradingDate,
      releaseContract: contract,
    }),
    ...(contractBars.some(
      (bar) => resolveTradingDate(bar.openAt).tradingDate !== bar.tradingDate,
    )
      ? ["ARCHIVE_TRADING_DATE_MISMATCH"]
      : []),
    ...(coverage.unexpectedOpenAts.length > 0 ? ["BARS_OUTSIDE_SESSION_GRID"] : []),
    ...(coverage.duplicateOpenAts.length > 0 ? ["DUPLICATE_MINUTE_BARS"] : []),
    ...(coverage.complete ? [] : ["INCOMPLETE_EVENT_WINDOW"]),
  ];
  const refusalReasons = [...new Set(reasons)];

  const reactionQualification: NqReactionQualification =
    refusalReasons.length > 0
      ? "refused"
      : weakestQualification(sessionDates.map((s) => s.qualification));

  return {
    releaseAt,
    tradingDate,
    tradingDateBasis: release.basis,
    contractSelection,
    eligibility: {
      ...eligibility,
      reasonCode: refusalReasons[0] ?? eligibility.reasonCode,
      qualification: reactionQualification,
    },
    sessionDates,
    bars,
    coverage,
    anchor: selectPreReleaseAnchor(contractBars, releaseAt),
    endpoint: selectEndpointAtOrAfter(contractBars, targetAt),
    provenance: ctx.provenance,
    refusalReasons,
    reactionQualification,
  };
}
