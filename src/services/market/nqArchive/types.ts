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
  /**
   * Minute opens inside the window that fall in Globex trading hours. The daily
   * 17:00–18:00 ET maintenance break and the Friday-close → Sunday-open
   * weekend are excluded rather than reported as missing.
   */
  readonly expectedBars: number;
  readonly observedBars: number;
  readonly expectedOpenAts: readonly Date[];
  /** Window minutes excluded from the grid as outside Globex hours. */
  readonly excludedClosedMinutes: number;
  /** Minute opens present for the selected contract inside the window. */
  readonly observedOpenAts: readonly Date[];
  /**
   * Expected minute opens with no selected-contract bar. Includes leading and
   * trailing gaps and the entire window when empty. Absence is unknown
   * (no-trade vs provider gap) — never imputed.
   */
  readonly missingOpenAts: readonly Date[];
  /**
   * Selected-contract bars stamped in a minute the session model says is
   * closed. Their presence means the model disagrees with the archive.
   */
  readonly unexpectedOpenAts: readonly Date[];
  /** Minute opens carried by more than one selected-contract bar. */
  readonly duplicateOpenAts: readonly Date[];
  /**
   * True when every expected minute has exactly one selected-contract bar.
   */
  readonly complete: boolean;
  /** Count of bars for a different contract inside the window. */
  readonly foreignContractBars: number;
}

/** Where a trading date came from. */
export type NqTradingDateBasis = "certification_calendar" | "heuristic_fallback";

export interface NqTradingDateResolution {
  /** Best-effort label; still returned when refused so callers can inspect. */
  readonly tradingDate: string;
  readonly basis: NqTradingDateBasis;
  /** Non-null when the date must not enter a qualified measurement. */
  readonly refusalReason: string | null;
}

/** Session dates listed in the archive's certification-by-session manifest. */
export interface NqTradingCalendar {
  readonly firstDate: string;
  readonly lastDate: string;
  isTradingDate(date: string): boolean;
}

/** A price taken from one archive bar. */
export interface NqPricePoint {
  readonly role: "anchor" | "endpoint";
  readonly bar: NqMinuteBar;
  readonly price: number;
  readonly priceField: "open" | "close";
}

/** Per-trading-date evidence for every session an event window touches. */
export interface NqWindowSession {
  readonly tradingDate: string;
  readonly qualification: NqReactionQualification;
  readonly reasonCode: string | null;
  /** Contract the causal roll registry selects for this date. */
  readonly contract: string;
  /** Allowlist contract for this date, when listed. */
  readonly allowlistContract: string | null;
  /** certification-by-session contract for this date, when listed. */
  readonly certificationContract: string | null;
  /** True when either manifest names a contract other than `contract`. */
  readonly conflictsWithCertification: boolean;
  /** Allowlist `expected_active_minutes`; null refuses the window. */
  readonly expectedActiveMinutes: number | null;
  /** Session-model minute count; computed only when a certified count exists. */
  readonly modelledActiveMinutes: number | null;
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
  /**
   * Reasons the archive-level acceptance / certification reports could not be
   * read. Any entry refuses every qualified measurement (fail closed).
   */
  readonly artifactRefusalReasons: readonly string[];
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
  /** Trading date of the first session in which the release is observable. */
  readonly tradingDate: string;
  readonly tradingDateBasis: NqTradingDateBasis;
  readonly contractSelection: NqContractSelection;
  /**
   * Release-date eligibility, with `qualification` / `reasonCode` replaced by
   * the window-level outcome.
   */
  readonly eligibility: NqSessionEligibility;
  /** Every trading date the window touches, ascending. */
  readonly sessionDates: readonly NqWindowSession[];
  readonly bars: readonly NqMinuteBar[];
  readonly coverage: NqCoverageReport;
  /**
   * Close of the last bar that ended at or before `releaseAt`, only when that
   * bar is the last fully elapsed minute; otherwise null and refused.
   */
  readonly anchor: NqPricePoint | null;
  /**
   * Open of the first bar at or after `releaseAt + afterMs`, only when it
   * opens within one minute of the target; otherwise null and refused.
   */
  readonly endpoint: NqPricePoint | null;
  readonly provenance: NqArchiveProvenance;
  /** Every reason the window was refused, most fundamental first. */
  readonly refusalReasons: readonly string[];
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
