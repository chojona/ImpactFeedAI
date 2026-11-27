/**
 * Free expectations-data contracts.
 *
 * Coordinate with Agent 03 / Phase 1.1 (`src/types/context.ts` on
 * `feat/phase-1.1-alfred-point-in-time`): that work owns ALFRED actuals and
 * `ContextObservation`. This module owns *expectations only* and must never
 * write into ContextObservation or invent publication timestamps.
 *
 * Kinds are mutually exclusive. A model nowcast is not survey consensus.
 */

/** How an expectation was produced. Never collapse these in surprise joins. */
export type ExpectationKind =
  | "SURVEY_CONSENSUS"
  | "MODEL_NOWCAST"
  | "PROFESSIONAL_SURVEY"
  | "MARKET_IMPLIED";

/**
 * Provenance quality of `asOf`.
 * - VERIFIED: provider supplied an exact UTC instant
 * - DATE_ONLY: provider supplied a calendar date; exact clock unknown (null)
 * - MISSING: value may exist but no defensible as-of was supplied
 */
export type ExpectationAsOfQuality = "VERIFIED" | "DATE_ONLY" | "MISSING";

export type ExpectationHorizon =
  | "release_print"
  | "quarter_ahead"
  | "year_ahead"
  | "ten_year"
  | "other";

export interface ExpectationQuery {
  readonly kind: ExpectationKind;
  readonly metricKey: string;
  /** YYYY-MM-DD reference-period start when known. */
  readonly referencePeriodStart: string | null;
  /** Exact release instant when independently established; never invented here. */
  readonly releaseAt: Date | null;
  /** Optional horizon filter (SPF). */
  readonly horizon?: ExpectationHorizon;
}

/**
 * One expectation snapshot. Missing consensus stays missing: `value` is null
 * and callers must not coerce to 0.
 */
export interface ExpectationObservation {
  readonly id: string;
  readonly kind: ExpectationKind;
  readonly metricKey: string;
  readonly referencePeriodStart: string | null;
  readonly horizon: ExpectationHorizon;
  readonly value: number | null;
  readonly unit: string;
  /**
   * Exact observation instant when known. Null when unknown — never invent
   * `releaseAt - ε` or a conventional survey freeze time.
   */
  readonly asOf: Date | null;
  readonly asOfQuality: ExpectationAsOfQuality;
  /** Calendar date (YYYY-MM-DD) when only a date is known. */
  readonly asOfDate: string | null;
  readonly source: string;
  readonly sourceUrl: string;
  readonly licenseNote: string;
  readonly providerRecordId: string | null;
  readonly fetchedAt: Date;
  readonly payloadHash: string;
}

export interface ExpectationProvider {
  readonly name: string;
  readonly kind: ExpectationKind;
  getExpectation(query: ExpectationQuery): Promise<ExpectationObservation | null>;
}
