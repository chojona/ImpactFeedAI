/**
 * Write gate for `reaction_measurements`.
 *
 * Production reads use CURRENT_REACTION_CALCULATION_VERSION (3). The engine
 * now computes COMPUTED_REACTION_CALCULATION_VERSION (4), which the Phase 0.5
 * review did NOT qualify for cutover (lossless replay, coverage and native
 * futures evidence are unresolved). Writing v4 rows before that cutover would
 * leave every newly backfilled event without visible reactions, because the
 * site keeps reading v3.
 *
 * Rule: a version may be persisted only when it is the live read version, or
 * when a cutover authorization for it is committed below. There is no CLI or
 * environment override — authorizing a version is a reviewed code change that
 * cites the qualification evidence. Dry-runs never consult this gate.
 */
import {
  COMPUTED_REACTION_CALCULATION_VERSION,
  CURRENT_REACTION_CALCULATION_VERSION,
} from "./timing";

export interface MeasurementCutoverAuthorization {
  /** The calculation version this record releases for writing. */
  readonly version: number;
  /** Repo-relative path to the evidence that qualified the cutover. */
  readonly qualificationEvidence: string;
  /** Who explicitly authorized the cutover. */
  readonly authorizedBy: string;
  /** ISO date (YYYY-MM-DD) of the authorization. */
  readonly authorizedOn: string;
}

/**
 * Committed cutover authorizations. Intentionally empty: the v4 cutover is
 * not qualified (Phase 0.5 decision: NO-GO). Add a record only together with
 * the qualifying evidence and the matching read-version change.
 */
export const MEASUREMENT_CUTOVER_AUTHORIZATIONS: readonly MeasurementCutoverAuthorization[] = [];

export type MeasurementWriteDecision =
  | { readonly allowed: true; readonly version: number; readonly basis: "live_read_version" | "authorized_cutover" }
  | { readonly allowed: false; readonly version: number; readonly reason: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isCompleteAuthorization(a: MeasurementCutoverAuthorization): boolean {
  return (
    a.qualificationEvidence.trim().length > 0 &&
    a.authorizedBy.trim().length > 0 &&
    ISO_DATE.test(a.authorizedOn) &&
    !Number.isNaN(Date.parse(a.authorizedOn))
  );
}

export function evaluateMeasurementWrite(input: {
  version: number;
  liveReadVersion?: number;
  authorizations?: readonly MeasurementCutoverAuthorization[];
}): MeasurementWriteDecision {
  const { version } = input;
  const liveReadVersion = input.liveReadVersion ?? CURRENT_REACTION_CALCULATION_VERSION;
  const authorizations = input.authorizations ?? MEASUREMENT_CUTOVER_AUTHORIZATIONS;

  if (!Number.isInteger(version) || version <= 0) {
    return { allowed: false, version, reason: `invalid calculation version ${String(version)}` };
  }
  if (version === liveReadVersion) {
    return { allowed: true, version, basis: "live_read_version" };
  }
  const record = authorizations.find((a) => a.version === version);
  if (!record) {
    return {
      allowed: false,
      version,
      reason:
        `v${version} write freeze: production reads v${liveReadVersion} and the v${version} cutover ` +
        "has not been qualified and explicitly authorized (see docs/audits/2026-11-05-phase-0.5-remediation.md)",
    };
  }
  if (!isCompleteAuthorization(record)) {
    return {
      allowed: false,
      version,
      reason: `v${version} cutover authorization is incomplete (needs evidence path, approver and ISO date)`,
    };
  }
  return { allowed: true, version, basis: "authorized_cutover" };
}

/** Decision for the version the measurement engine currently computes. */
export function evaluateComputedMeasurementWrite(): MeasurementWriteDecision {
  return evaluateMeasurementWrite({ version: COMPUTED_REACTION_CALCULATION_VERSION });
}

export class MeasurementWriteFrozenError extends Error {
  constructor(readonly decision: Extract<MeasurementWriteDecision, { allowed: false }>) {
    super(`Refusing to write reaction measurements. ${decision.reason}.`);
    this.name = "MeasurementWriteFrozenError";
  }
}

/** Throws unless the version may be persisted. Use immediately before writes. */
export function assertMeasurementWriteAllowed(version: number): void {
  const decision = evaluateMeasurementWrite({ version });
  if (!decision.allowed) throw new MeasurementWriteFrozenError(decision);
}
