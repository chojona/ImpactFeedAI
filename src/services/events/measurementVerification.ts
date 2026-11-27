/** Pure, family-specific checks. CLI coverage is separately source-event driven. */
import { REACTION_MEASURES, measureFamily, sessionOffsetFor, type ReactionMeasure } from "./reactionMeasures";
import { INTRADAY_ANCHOR_MAX_AGE_MS, INTRADAY_ENDPOINT_SLIP_MS, INTRADAY_ENDPOINT_TARGET_MS } from "./reactionMeasurement";
import { economicCloseInstant, type SessionBasis } from "../market/sessionBasis";
import type { PriceBasis } from "@/types/market";
export interface VerifiableMeasurementRow {
  measure: ReactionMeasure;
  anchorKind: "PRE_RELEASE_INTRADAY_BAR" | "PRIOR_SESSION_CLOSE";
  anchorPrice: number;
  anchorBarAt: Date;
  /** Canonical session day, YYYY-MM-DD. */
  anchorSessionDay: string;
  endpointPrice: number;
  endpointBarAt: Date;
  endpointSessionDay: string;
  releaseSessionDay: string;
  pctChange: number;
  priceBasis: PriceBasis;
  sessionBasis: SessionBasis;
  anchorAvailableAt?: Date;
}

export interface InvariantContext {
  releaseAt: Date;
  /** The canonical calendar's session days, in order, covering this row. */
  sessionDays: readonly string[];
  /** From the canonical calendar — required to resolve an equity close. */
  isEarlyClose: (day: string) => boolean;
  earlyCloseKnown?: (day: string) => boolean;
}

export type InvariantViolation =
  | "invalid_measure"
  | "invalid_timestamp"
  | "invalid_price_basis"
  | "unsupported_session_basis"
  | "unsupported_calendar_range"
  | "release_session_mismatch"
  | "daily_bar_session_mismatch"
  | "intraday_anchor_too_old"
  | "intraday_session_labels_mismatch"
  | "anchor_availability_invalid"
  | "anchor_not_available_before_release"
  | "non_positive_price"
  | "non_canonical_session_day"
  | "pct_change_inconsistent"
  | "anchor_kind_family_mismatch"
  | "anchor_session_not_adjacent"
  | "endpoint_session_offset_mismatch"
  | "anchor_close_not_pre_release"
  | "intraday_anchor_not_pre_release"
  | "anchor_bar_not_before_endpoint"
  | "anchor_session_after_release"
  | "endpoint_session_before_release"
  | "intraday_endpoint_outside_window";

const PCT_TOLERANCE = 1e-6;

/**
 * Every invariant a stored row must satisfy, branched by measure family per
 * spec §6.2. Never combines the two families' rules into one shared check —
 * a rule that is valid for one family and invalid for the other must be
 * represented explicitly rather than loosened until both pass.
 */
export function checkInvariants(
  row: VerifiableMeasurementRow,
  ctx: InvariantContext,
): InvariantViolation[] {
  const violations: InvariantViolation[] = [];

  if (!REACTION_MEASURES.includes(row.measure)) return ["invalid_measure"];
  if (!["US_EQUITY_RTH", "EXTENDED_FUTURES", "CONTINUOUS_24_7"].includes(row.sessionBasis)) return ["unsupported_session_basis"];
  if (!["AS_TRADED", "SPLIT_ADJUSTED", "SPLIT_DIVIDEND_ADJUSTED"].includes(row.priceBasis)) violations.push("invalid_price_basis");
  if (![row.anchorBarAt, row.endpointBarAt, ctx.releaseAt].every(d => d instanceof Date && Number.isFinite(d.getTime()))) return [...violations, "invalid_timestamp"];
  const validDay = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(`${day}T00:00:00Z`)) && new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;
  if (![row.anchorSessionDay, row.endpointSessionDay, row.releaseSessionDay, ...ctx.sessionDays].every(validDay)) return [...violations, "non_canonical_session_day"];
  if (ctx.earlyCloseKnown && [row.anchorSessionDay, row.endpointSessionDay, row.releaseSessionDay].some(d => !ctx.earlyCloseKnown!(d))) violations.push("unsupported_calendar_range");
  // Independent origin check: first canonical EQUITY close after release,
  // regardless of the stored origin/offset. Fixtures supply official hours.
  const origin = ctx.sessionDays.find(day => economicCloseInstant({ basis: "US_EQUITY_RTH", sessionDay: day, barAt: ctx.releaseAt, isEarlyClose: ctx.isEarlyClose(day) }).getTime() > ctx.releaseAt.getTime());
  if (origin !== row.releaseSessionDay) violations.push("release_session_mismatch");

  // ── universal (§6.1) ─────────────────────────────────────────────────
  if (
    !Number.isFinite(row.anchorPrice) ||
    row.anchorPrice <= 0 ||
    !Number.isFinite(row.endpointPrice) ||
    row.endpointPrice <= 0
  ) {
    violations.push("non_positive_price");
  }

  const dayIndex = new Map(ctx.sessionDays.map((day, i) => [day, i]));
  const anchorIdx = dayIndex.get(row.anchorSessionDay);
  const endpointIdx = dayIndex.get(row.endpointSessionDay);
  const releaseIdx = dayIndex.get(row.releaseSessionDay);
  if (anchorIdx === undefined || endpointIdx === undefined || releaseIdx === undefined) {
    violations.push("non_canonical_session_day");
  }

  if (Number.isFinite(row.anchorPrice) && row.anchorPrice > 0) {
    const expected = ((row.endpointPrice - row.anchorPrice) / row.anchorPrice) * 100;
    if (
      !Number.isFinite(expected) ||
      !Number.isFinite(row.pctChange) ||
      Math.abs(row.pctChange - expected) > Math.max(PCT_TOLERANCE, Math.abs(expected) * 1e-9)
    ) {
      violations.push("pct_change_inconsistent");
    }
  }

  const family = measureFamily(row.measure);
  const expectedAnchorKind =
    family === "SESSION" ? "PRIOR_SESSION_CLOSE" : "PRE_RELEASE_INTRADAY_BAR";
  if (row.anchorKind !== expectedAnchorKind) {
    violations.push("anchor_kind_family_mismatch");
  }

  // Universal (§6.1), applied to BOTH families. Weaker than the
  // family-specific checks below — it is a bar-ordering and session-ordering
  // floor, not a substitute for `anchor_close_not_pre_release` (session) or
  // `intraday_anchor_not_pre_release` (intraday). For INTRADAY_60M all three
  // session-day fields are set to the release session, so these hold
  // trivially there; for the session family they are independent of, and
  // weaker than, the adjacency/offset checks below.
  if (row.anchorBarAt.getTime() >= row.endpointBarAt.getTime()) {
    violations.push("anchor_bar_not_before_endpoint");
  }
  if (
    anchorIdx !== undefined &&
    releaseIdx !== undefined &&
    anchorIdx > releaseIdx
  ) {
    violations.push("anchor_session_after_release");
  }
  if (
    endpointIdx !== undefined &&
    releaseIdx !== undefined &&
    endpointIdx < releaseIdx
  ) {
    violations.push("endpoint_session_before_release");
  }

  // ── family-branched (§6.2) ───────────────────────────────────────────
  if (family === "SESSION") {
    const stampDay = (at: Date) => row.sessionBasis === "CONTINUOUS_24_7"
      ? at.toISOString().slice(0, 10)
      : new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
    if (stampDay(row.anchorBarAt) !== row.anchorSessionDay || stampDay(row.endpointBarAt) !== row.endpointSessionDay) violations.push("daily_bar_session_mismatch");
    if (
      anchorIdx !== undefined &&
      releaseIdx !== undefined &&
      anchorIdx !== releaseIdx - 1
    ) {
      violations.push("anchor_session_not_adjacent");
    }
    const offset = sessionOffsetFor(row.measure);
    if (
      offset !== null &&
      endpointIdx !== undefined &&
      releaseIdx !== undefined &&
      endpointIdx !== releaseIdx + offset
    ) {
      violations.push("endpoint_session_offset_mismatch");
    }

    // The anchor PRICE must have been realised strictly before the release.
    // Resolved per SessionBasis from the bar itself, NOT by comparing
    // `anchorBarAt` to `releaseAt` — a daily bar's stamp is an identifier and
    // usually the session OPEN, so that comparison is meaningless here. This
    // is the check that catches the Stage-2 BTC defect, where a UTC-day bar
    // mislabelled onto the previous Eastern date supplied an anchor price not
    // realised until 11.5h AFTER the release.
    const anchorClose = economicCloseInstant({
      basis: row.sessionBasis,
      sessionDay: row.anchorSessionDay,
      barAt: row.anchorBarAt,
      isEarlyClose: ctx.isEarlyClose(row.anchorSessionDay),
    });
    if (row.anchorAvailableAt !== undefined) {
      if (!Number.isFinite(row.anchorAvailableAt.getTime()) || row.anchorAvailableAt.getTime() < anchorClose.getTime()) violations.push("anchor_availability_invalid");
      if (row.anchorAvailableAt.getTime() >= ctx.releaseAt.getTime()) violations.push("anchor_not_available_before_release");
    }
    if (anchorClose.getTime() >= ctx.releaseAt.getTime()) {
      violations.push("anchor_close_not_pre_release");
    }
  } else {
    if (row.anchorSessionDay !== row.releaseSessionDay || row.endpointSessionDay !== row.releaseSessionDay) violations.push("intraday_session_labels_mismatch");
    if (ctx.releaseAt.getTime() - row.anchorBarAt.getTime() > INTRADAY_ANCHOR_MAX_AGE_MS) violations.push("intraday_anchor_too_old");
    if (row.anchorAvailableAt !== undefined) {
      if (!Number.isFinite(row.anchorAvailableAt.getTime()) || row.anchorAvailableAt.getTime() < row.anchorBarAt.getTime()) violations.push("anchor_availability_invalid");
      if (row.anchorAvailableAt.getTime() >= ctx.releaseAt.getTime()) violations.push("anchor_not_available_before_release");
    }
    // INTRADAY_60M: instant ordering against releaseAt is meaningful (the
    // session family's bar stamps are not, per the module doc comment).
    if (row.anchorBarAt.getTime() >= ctx.releaseAt.getTime()) {
      violations.push("intraday_anchor_not_pre_release");
    }

    // §6.2's table also documents the endpoint window bound, matching the
    // engine's own target/slip constants. Previously only reported as a
    // distribution statistic — never enforced as a violation.
    const target = ctx.releaseAt.getTime() + INTRADAY_ENDPOINT_TARGET_MS;
    const endpointMs = row.endpointBarAt.getTime();
    if (endpointMs < target || endpointMs - target > INTRADAY_ENDPOINT_SLIP_MS) {
      violations.push("intraday_endpoint_outside_window");
    }
  }

  return violations;
}

