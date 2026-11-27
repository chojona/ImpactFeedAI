/**
 * Read-only local Databento NQ outright archive adapter.
 *
 * Use {@link createNqArchiveAdapter} with `NQ_ARCHIVE_ROOT` (or individual path
 * env vars) pointing at the external `databento-nq-full-history` directory.
 * Qualified reaction measurements must honour `reactionQualification` and must
 * never point this adapter at the uncertified continuous series.
 */
export {
  createFixtureNqArchiveAdapter,
  createNqArchiveAdapter,
  type CreateNqArchiveAdapterOptions,
  type NqArchiveAdapter,
} from "./adapter";
export { selectEndpointAtOrAfter, selectPreReleaseAnchor } from "./anchor";
export {
  readArchiveStatus,
  readCertificationVersion,
  type NqArchiveArtifact,
  type NqArchiveStatusRead,
} from "./artifacts";
export { buildCoverageReport, releaseMinuteOpen } from "./coverage";
export { parseCsv, readCsvRecords } from "./csv";
export {
  createEligibilityIndex,
  loadEligibilityIndex,
  qualificationFromEvidence,
  type AllowlistRow,
  type NqEligibilityIndex,
} from "./eligibility";
export { NqArchiveDataError } from "./errors";
export { extractEventWindow } from "./extract";
export {
  createMemoryNqBarStore,
  syntheticMinuteBars,
} from "./memoryStore";
export {
  createParquetNqBarStore,
  parquetRowsToBars,
  parquetTimestampToDate,
  type NqBarQuery,
  type NqParquetRow,
  type NqParquetRowReader,
  type NqRowRejection,
  type NqRowRejectionReason,
} from "./parquetStore";
export {
  NqArchivePathError,
  pathsFromArchiveRoot,
  resolveNqArchivePaths,
  type NqArchiveEnv,
} from "./paths";
export { loadRollBoundaries, parseRollBoundary, selectContractAsOf } from "./rolls";
export { isGlobexActiveMinute, sessionMinuteCount } from "./sessionGrid";
export {
  SESSION_RULES_START_DATE,
  ceilUtcMinute,
  contiguousUtcMinuteOpens,
  createTradingCalendar,
  createTradingDateResolver,
  newYorkWallClock,
  tradingDateForReleaseAt,
  utcMinuteOpen,
  type NewYorkWallClock,
} from "./tradingDate";
export { isUsMarketHoliday } from "./usHolidays";
export type {
  NqArchivePaths,
  NqArchiveProvenance,
  NqBarStore,
  NqContractSelection,
  NqCoverageReport,
  NqEventWindowRequest,
  NqEventWindowResult,
  NqMinuteBar,
  NqPricePoint,
  NqReactionQualification,
  NqResearchTier,
  NqRollBoundary,
  NqSessionEligibility,
  NqTradingCalendar,
  NqTradingDateBasis,
  NqTradingDateResolution,
  NqWindowSession,
} from "./types";
