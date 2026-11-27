/**
 * Resolve external NQ archive paths from explicit config or environment.
 *
 * The archive lives outside this repository. Nothing here copies, uploads or
 * mutates those files.
 */
import path from "node:path";

import type { NqArchivePaths } from "./types";

/** Filenames that identify the uncertified continuous research series. */
const FORBIDDEN_BASENAMES = new Set([
  "adjusted.parquet",
  "raw.parquet",
  "selected-gap-intervals.parquet",
  "session-eligibility.parquet",
]);

const FORBIDDEN_PATH_MARKERS = [
  "nq-continuous",
  "nq_continuous",
  "continuous-v1",
] as const;

export class NqArchivePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NqArchivePathError";
  }
}

const trim = (value: string | undefined): string | undefined => {
  if (value === undefined) return undefined;
  const next = value.trim();
  return next.length > 0 ? next : undefined;
};

const assertNotContinuous = (filePath: string, label: string): void => {
  const normalized = path.normalize(filePath);
  const base = path.basename(normalized).toLowerCase();
  if (FORBIDDEN_BASENAMES.has(base)) {
    throw new NqArchivePathError(
      `${label} points at a continuous-series artifact (${base}). ` +
        "Qualified NQ reactions must use the quarterly-outright archive only.",
    );
  }
  const lower = normalized.toLowerCase();
  for (const marker of FORBIDDEN_PATH_MARKERS) {
    if (lower.includes(marker)) {
      throw new NqArchivePathError(
        `${label} path contains continuous-series marker "${marker}". ` +
          "Refuse and point NQ_OUTRIGHT_PARQUET at nq_outright_ohlcv_1m.parquet.",
      );
    }
  }
};

/**
 * Build paths from an archive root directory that contains the standard
 * Databento NQ full-history layout produced by the sibling research pipeline.
 */
export function pathsFromArchiveRoot(root: string): NqArchivePaths {
  const base = path.resolve(root);
  return {
    outrightParquet: path.join(base, "nq_outright_ohlcv_1m.parquet"),
    rollsCsv: path.join(base, "rolls.csv"),
    certificationBySessionCsv: path.join(base, "certification-by-session.csv"),
    acceptanceReportJson: path.join(base, "acceptance-report.json"),
    certificationReportJson: path.join(base, "certification-report.json"),
    strictAllowlistCsv: path.join(
      base,
      "phase3-v3.0.0",
      "strict-certified-allowlist.csv",
    ),
    exploratoryAllowlistCsv: path.join(
      base,
      "phase3-v3.0.0",
      "exploratory-research-allowlist.csv",
    ),
  };
}

/**
 * Resolve archive paths from `process.env` (and optional overrides).
 *
 * Precedence:
 * 1. Explicit `overrides`
 * 2. Individual `NQ_*` file path variables
 * 3. `NQ_ARCHIVE_ROOT` layout defaults
 */
export type NqArchiveEnv = Readonly<Record<string, string | undefined>>;

export function resolveNqArchivePaths(
  env: NqArchiveEnv = process.env,
  overrides: Partial<NqArchivePaths> = {},
): NqArchivePaths {
  const root = trim(env.NQ_ARCHIVE_ROOT);
  const fromRoot = root ? pathsFromArchiveRoot(root) : null;

  const outrightParquet =
    overrides.outrightParquet ??
    trim(env.NQ_OUTRIGHT_PARQUET) ??
    fromRoot?.outrightParquet;
  const rollsCsv =
    overrides.rollsCsv ?? trim(env.NQ_ROLLS_CSV) ?? fromRoot?.rollsCsv;

  if (!outrightParquet || !rollsCsv) {
    throw new NqArchivePathError(
      "NQ archive paths are not configured. Set NQ_ARCHIVE_ROOT or both " +
        "NQ_OUTRIGHT_PARQUET and NQ_ROLLS_CSV to the local Databento outright archive.",
    );
  }

  const optionalPath = (
    override: string | undefined,
    envValue: string | undefined,
    fromRootValue: string | undefined,
  ): string | undefined => {
    const raw = override ?? envValue ?? fromRootValue;
    return raw ? path.resolve(raw) : undefined;
  };

  const paths: NqArchivePaths = {
    outrightParquet: path.resolve(outrightParquet),
    rollsCsv: path.resolve(rollsCsv),
    strictAllowlistCsv: optionalPath(
      overrides.strictAllowlistCsv,
      trim(env.NQ_STRICT_ALLOWLIST_CSV),
      fromRoot?.strictAllowlistCsv,
    ),
    exploratoryAllowlistCsv: optionalPath(
      overrides.exploratoryAllowlistCsv,
      trim(env.NQ_EXPLORATORY_ALLOWLIST_CSV),
      fromRoot?.exploratoryAllowlistCsv,
    ),
    certificationBySessionCsv: optionalPath(
      overrides.certificationBySessionCsv,
      trim(env.NQ_CERTIFICATION_BY_SESSION_CSV),
      fromRoot?.certificationBySessionCsv,
    ),
    acceptanceReportJson: optionalPath(
      overrides.acceptanceReportJson,
      trim(env.NQ_ACCEPTANCE_REPORT_JSON),
      fromRoot?.acceptanceReportJson,
    ),
    certificationReportJson: optionalPath(
      overrides.certificationReportJson,
      trim(env.NQ_CERTIFICATION_REPORT_JSON),
      fromRoot?.certificationReportJson,
    ),
  };

  assertNotContinuous(paths.outrightParquet, "NQ_OUTRIGHT_PARQUET");
  assertNotContinuous(paths.rollsCsv, "NQ_ROLLS_CSV");

  return paths;
}
