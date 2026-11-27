/**
 * Read-only Databento NQ outright archive types.
 *
 * The adapter consumes the local quarterly-outright 1-minute OHLCV parquet and
 * its certification manifests. It never reads the uncertified continuous
 * series and never writes anywhere.
 */

/** One within-contract 1-minute OHLCV bar. */
export interface NqMinuteBar {
  /** Inclusive bar-open instant (UTC). */
  readonly openAt: Date;
  /** CME Globex trading date YYYY-MM-DD associated with this bar. */
  readonly tradingDate: string;
  readonly contract: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  /** Provider nanosecond event timestamp when known. */
  readonly tsEventNs: bigint | null;
}

export type NqResearchTier = "A" | "B" | "C" | "D" | "UNKNOWN";

/**
 * Whether bars may enter a *qualified* reaction measurement.
 *
 * Tier A (strict allowlist) is the only path that returns `strict`. Tier B
 * returns `exploratory` and must not be treated as calendar-certified. Missing
 * or rejected sessions return `refused` — the adapter still can return bars for
 * inspection, but callers must not promote them to qualified reactions.
 */
export type NqReactionQualification = "strict" | "exploratory" | "refused";

export interface NqRollBoundary {
  /** Last trading date that kept the old contract. */
  readonly fromDate: string;
  /** First trading date that used the new contract. */
  readonly toDate: string;
  readonly oldContract: string;
  readonly newContract: string;
  readonly volumeOld: number;
  readonly volumeNew: number;
  readonly pairedMinuteCount: number;
  readonly artificialCrossContractReturnUsed: boolean;
}

export interface NqContractSelection {
  readonly tradingDate: string;
  readonly contract: string;
  /**
   * How the contract was chosen. `prior_session_volume_roll` means the latest
   * roll with `toDate <= tradingDate` was applied — that roll was decided from
   * volume on `fromDate`, which is strictly before the event session.
   */
  readonly method: "prior_session_volume_roll" | "pre_first_roll_contract";
  /** Roll that introduced this contract, if any. */
  readonly activatingRoll: NqRollBoundary | null;
  /** True when an allowlist/cert row names a different contract. */
  readonly conflictsWithCertification: boolean;
  readonly certificationContract: string | null;
}

export interface NqSessionEligibility {
  readonly tradingDate: string;
  readonly tier: NqResearchTier;
  readonly researchEligibility: string | null;
  readonly reasonCode: string | null;
  readonly calendarValidity: string | null;
  readonly providerIntegrity: string | null;
  readonly contractSelectionEvidence: string | null;
  readonly observedCoverage: string | null;
  readonly selectedContract: string | null;
  readonly sourceIds: readonly string[];
  readonly qualification: NqReactionQualification;
}

export interface NqCoverageReport {
  /** Inclusive window requested by the caller (minute-aligned). */
  readonly windowStart: Date;
  readonly windowEnd: Date;
  /** Contiguous UTC minute opens expected across the full requested window. */
  readonly expectedBars: number;
  readonly observedBars: number;
  readonly expectedOpenAts: readonly Date[];
  /** Minute opens present for the selected contract inside the window. */
  readonly observedOpenAts: readonly Date[];
  /**
   * Expected minute opens with no selected-contract bar. Includes leading and
   * trailing gaps and the entire window when empty. Absence is unknown
   * (no-trade vs provider gap) — never imputed.
   */
  readonly missingOpenAts: readonly Date[];
  /** True when every expected minute has a selected-contract bar. */
  readonly complete: boolean;
  /** Count of bars for a different contract inside the window. */
  readonly foreignContractBars: number;
}

export interface NqArchiveProvenance {
  readonly provider: "databento";
  readonly dataset: "GLBX.MDP3";
  readonly schema: "ohlcv-1m";
  readonly seriesKind: "quarterly_outright";
  readonly priceBasis: "AS_TRADED";
  readonly outrightParquetPath: string;
  readonly rollsCsvPath: string;
  readonly strictAllowlistPath: string | null;
  readonly exploratoryAllowlistPath: string | null;
  readonly certificationBySessionPath: string | null;
  readonly acceptanceStatus: string | null;
  readonly certificationStatus: string | null;
  readonly certificationVersion: string | null;
  readonly continuousSeriesRejected: true;
}

export interface NqEventWindowRequest {
  /**
   * Exact release instant. Callers must only pass verified/scheduled timing
   * when building qualified reactions; the adapter itself requires a finite
   * Date and does not invent one.
   */
  readonly releaseAt: Date;
  /** Inclusive lookback before `releaseAt` (ms). */
  readonly beforeMs: number;
  /** Inclusive lookforward after `releaseAt` (ms). */
  readonly afterMs: number;
}

export interface NqEventWindowResult {
  readonly releaseAt: Date;
  readonly tradingDate: string;
  readonly contractSelection: NqContractSelection;
  readonly eligibility: NqSessionEligibility;
  readonly bars: readonly NqMinuteBar[];
  readonly coverage: NqCoverageReport;
  readonly provenance: NqArchiveProvenance;
  /**
   * Mirror of `eligibility.qualification`. Callers that compute qualified
   * reactions must refuse when this is not `strict` (or, for labelled
   * exploratory research only, `exploratory`).
   */
  readonly reactionQualification: NqReactionQualification;
}

export interface NqArchivePaths {
  readonly outrightParquet: string;
  readonly rollsCsv: string;
  readonly strictAllowlistCsv?: string;
  readonly exploratoryAllowlistCsv?: string;
  readonly certificationBySessionCsv?: string;
  readonly acceptanceReportJson?: string;
  readonly certificationReportJson?: string;
}

/** Injected bar source so unit tests need no parquet dependency on disk. */
export interface NqBarStore {
  queryWithinContract(args: {
    contract: string;
    startInclusive: Date;
    endInclusive: Date;
  }): Promise<readonly NqMinuteBar[]>;
}
