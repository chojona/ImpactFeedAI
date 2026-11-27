/**
 * Factory for the read-only local Databento NQ outright archive adapter.
 */
import {
  readArchiveStatus,
  readCertificationVersion,
  type NqArchiveArtifact,
  type NqArchiveStatusRead,
} from "./artifacts";
import { loadEligibilityIndex, type NqEligibilityIndex } from "./eligibility";
import { extractEventWindow } from "./extract";
import { createMemoryNqBarStore } from "./memoryStore";
import { createParquetNqBarStore } from "./parquetStore";
import { resolveNqArchivePaths } from "./paths";
import { loadRollBoundaries } from "./rolls";
import type {
  NqArchivePaths,
  NqArchiveProvenance,
  NqBarStore,
  NqEventWindowRequest,
  NqEventWindowResult,
  NqMinuteBar,
  NqRollBoundary,
} from "./types";

export interface NqArchiveAdapter {
  readonly paths: NqArchivePaths;
  readonly provenance: NqArchiveProvenance;
  extractEventWindow(
    request: NqEventWindowRequest,
  ): Promise<NqEventWindowResult>;
}

export interface CreateNqArchiveAdapterOptions {
  /** Explicit paths; otherwise resolved from env. */
  readonly paths?: Partial<NqArchivePaths> | NqArchivePaths;
  readonly env?: Readonly<Record<string, string | undefined>>;
  /**
   * Injected bar store (tests). When omitted, the outright parquet at the
   * resolved path is opened read-only.
   */
  readonly barStore?: NqBarStore;
  /** Injected rolls (tests). */
  readonly rolls?: readonly NqRollBoundary[];
  /** Injected eligibility index (tests). */
  readonly eligibility?: NqEligibilityIndex;
  /**
   * Optional provenance overrides for fixtures. A non-empty acceptance /
   * certification status here stands in for the corresponding report file.
   */
  readonly provenanceExtras?: Partial<
    Pick<
      NqArchiveProvenance,
      "acceptanceStatus" | "certificationStatus" | "certificationVersion"
    >
  >;
}

const statusFrom = async (
  override: string | null | undefined,
  filePath: string | undefined,
  artifact: NqArchiveArtifact,
): Promise<NqArchiveStatusRead> =>
  override
    ? { status: override, refusalReason: null }
    : readArchiveStatus(filePath, artifact);

const buildProvenance = (
  paths: NqArchivePaths,
  extras: Pick<
    NqArchiveProvenance,
    | "acceptanceStatus"
    | "certificationStatus"
    | "certificationVersion"
    | "artifactRefusalReasons"
  >,
): NqArchiveProvenance => ({
  provider: "databento",
  dataset: "GLBX.MDP3",
  schema: "ohlcv-1m",
  // Hard invariants — never accept continuous / adjusted series here.
  seriesKind: "quarterly_outright",
  priceBasis: "AS_TRADED",
  continuousSeriesRejected: true,
  outrightParquetPath: paths.outrightParquet,
  rollsCsvPath: paths.rollsCsv,
  strictAllowlistPath: paths.strictAllowlistCsv ?? null,
  exploratoryAllowlistPath: paths.exploratoryAllowlistCsv ?? null,
  certificationBySessionPath: paths.certificationBySessionCsv ?? null,
  acceptanceStatus: extras.acceptanceStatus,
  certificationStatus: extras.certificationStatus,
  certificationVersion: extras.certificationVersion,
  artifactRefusalReasons: extras.artifactRefusalReasons,
});

export async function createNqArchiveAdapter(
  options: CreateNqArchiveAdapterOptions = {},
): Promise<NqArchiveAdapter> {
  const paths = resolveNqArchivePaths(options.env ?? process.env, options.paths);

  const rolls =
    options.rolls ?? (await loadRollBoundaries(paths.rollsCsv));

  const eligibility =
    options.eligibility ??
    (await loadEligibilityIndex({
      strictAllowlistCsv: paths.strictAllowlistCsv,
      exploratoryAllowlistCsv: paths.exploratoryAllowlistCsv,
      certificationBySessionCsv: paths.certificationBySessionCsv,
    }));

  const barStore =
    options.barStore ?? createParquetNqBarStore(paths.outrightParquet);

  const extras = options.provenanceExtras ?? {};
  const acceptance = await statusFrom(
    extras.acceptanceStatus,
    paths.acceptanceReportJson,
    "ACCEPTANCE_REPORT",
  );
  const certification = await statusFrom(
    extras.certificationStatus,
    paths.certificationReportJson,
    "CERTIFICATION_REPORT",
  );
  const certificationVersion =
    extras.certificationVersion ??
    (await readCertificationVersion(paths.strictAllowlistCsv));

  const provenance = buildProvenance(paths, {
    acceptanceStatus: acceptance.status,
    certificationStatus: certification.status,
    certificationVersion,
    artifactRefusalReasons: [
      acceptance.refusalReason,
      certification.refusalReason,
    ].filter((reason): reason is string => reason !== null),
  });

  return {
    paths,
    provenance,
    extractEventWindow(request) {
      return extractEventWindow(
        { rolls, eligibility, bars: barStore, provenance },
        request,
      );
    },
  };
}

/** Test helper: adapter over synthetic bars + explicit rolls/eligibility. */
export async function createFixtureNqArchiveAdapter(args: {
  bars: readonly NqMinuteBar[];
  rolls: readonly NqRollBoundary[];
  eligibility: NqEligibilityIndex;
  paths?: Partial<NqArchivePaths>;
}): Promise<NqArchiveAdapter> {
  const paths = resolveNqArchivePaths(
    {
      NQ_OUTRIGHT_PARQUET:
        args.paths?.outrightParquet ??
        "/tmp/impactfeed-nq-fixtures/nq_outright_ohlcv_1m.parquet",
      NQ_ROLLS_CSV:
        args.paths?.rollsCsv ?? "/tmp/impactfeed-nq-fixtures/rolls.csv",
    },
    args.paths,
  );

  return createNqArchiveAdapter({
    paths,
    rolls: args.rolls,
    eligibility: args.eligibility,
    barStore: createMemoryNqBarStore(args.bars),
    provenanceExtras: {
      acceptanceStatus: "FIXTURE",
      certificationStatus: "FIXTURE",
      certificationVersion: "fixture-v1",
    },
  });
}
