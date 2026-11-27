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
export { buildCoverageReport, releaseMinuteOpen } from "./coverage";
export {
  loadEligibilityIndex,
  type NqEligibilityIndex,
} from "./eligibility";
export { extractEventWindow } from "./extract";
export {
  createMemoryNqBarStore,
  syntheticMinuteBars,
} from "./memoryStore";
export { createParquetNqBarStore } from "./parquetStore";
export {
  NqArchivePathError,
  pathsFromArchiveRoot,
  resolveNqArchivePaths,
  type NqArchiveEnv,
} from "./paths";
export { loadRollBoundaries, parseRollBoundary, selectContractAsOf } from "./rolls";
export {
  contiguousUtcMinuteOpens,
  tradingDateForReleaseAt,
  utcMinuteOpen,
} from "./tradingDate";
export type {
  NqArchivePaths,
  NqArchiveProvenance,
  NqBarStore,
  NqContractSelection,
  NqCoverageReport,
  NqEventWindowRequest,
  NqEventWindowResult,
  NqMinuteBar,
  NqReactionQualification,
  NqResearchTier,
  NqRollBoundary,
  NqSessionEligibility,
} from "./types";
