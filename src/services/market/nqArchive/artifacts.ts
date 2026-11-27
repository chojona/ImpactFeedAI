/**
 * Archive-level acceptance / certification report readers.
 *
 * A report that is not configured, missing, unreadable, unparseable or has no
 * `status` yields an explicit refusal reason instead of a silent null, so the
 * adapter refuses every qualified measurement (fail closed).
 */
import { readFile } from "node:fs/promises";

import { readCsvRecords } from "./csv";

export type NqArchiveArtifact = "ACCEPTANCE_REPORT" | "CERTIFICATION_REPORT";

export interface NqArchiveStatusRead {
  readonly status: string | null;
  readonly refusalReason: string | null;
}

const refuse = (
  artifact: NqArchiveArtifact,
  problem: string,
): NqArchiveStatusRead => ({
  status: null,
  refusalReason: `${artifact}_${problem}`,
});

const errorCode = (error: unknown): string | null =>
  error instanceof Error && "code" in error && typeof error.code === "string"
    ? error.code
    : null;

export async function readArchiveStatus(
  filePath: string | undefined,
  artifact: NqArchiveArtifact,
): Promise<NqArchiveStatusRead> {
  if (!filePath) return refuse(artifact, "NOT_CONFIGURED");

  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    return refuse(artifact, errorCode(error) === "ENOENT" ? "MISSING" : "UNREADABLE");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return refuse(artifact, "UNPARSEABLE");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return refuse(artifact, "UNPARSEABLE");
  }

  const status: unknown = (parsed as Record<string, unknown>).status;
  if (typeof status !== "string" || status.trim() === "") {
    return refuse(artifact, "STATUS_MISSING");
  }
  return { status, refusalReason: null };
}

/** Informational only — never gates qualification. */
export async function readCertificationVersion(
  strictAllowlistCsv: string | undefined,
): Promise<string | null> {
  if (!strictAllowlistCsv) return null;
  try {
    const rows = await readCsvRecords(strictAllowlistCsv);
    return rows[0]?.certification_version || null;
  } catch {
    return null;
  }
}
