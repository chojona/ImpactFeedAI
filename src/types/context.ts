/**
 * Shared Phase 1 market-context contracts.
 *
 * Coordination:
 * - Agent 03 (Phase 1.1 ALFRED / PIT selector) owns macro revision selection and
 *   vintage-aware transforms. Keep `KnowledgeMode` string values identical so
 *   selector outputs and feature inputs share one vocabulary.
 * - Agent 05 (market-price adapters) populates {@link MarketContextObservation}
 *   rows for VIX, Treasury yields and equity closes.
 * - This module owns continuous feature result shapes consumed by regime math.
 *
 * Persistence / Prisma models are intentionally absent here.
 */

/**
 * How a query claims knowledge of the information set.
 * Values match Agent 03 Phase 1.1 — do not rename without coordinating.
 */
export type KnowledgeMode =
  | "PUBLIC_INFORMATION_RECONSTRUCTION"
  | "SYSTEM_REPLAY";

/** Quality / eligibility hint on a market observation. */
export type MarketObservationQuality =
  | "verified"
  | "conservative_date_bound"
  | "unknown_availability"
  | "missing"
  | "conflict";

/**
 * Lean daily market observation for feature calculators.
 *
 * Distinct from Agent 03's macro `ContextObservation` (vintage/revision heavy).
 * Agent 05 adapters should emit this shape; Agent 03 may also project selected
 * FRED market series (VIXCLS, DGS*) into it after PIT filtering.
 */
export interface MarketContextObservation {
  /** Stable id for lineage / FeatureResult.inputRefs. */
  readonly id: string;
  /** Canonical series key, e.g. `market:VIXCLS:level`. */
  readonly seriesKey: string;
  /** Finite measured value, or null when the source marked the print missing. */
  readonly value: number | null;
  /** Declared unit; feature calculators refuse mismatched units. */
  readonly unit: ContextUnit;
  /**
   * When the market print occurred (e.g. session economic close).
   * Not a publication/availability substitute.
   */
  readonly observationAt: Date;
  /**
   * Source business/session date `YYYY-MM-DD` for same-date pairing
   * (yields) and consecutive-session windows (RV). Required for those features.
   */
  readonly observationDate: string;
  /** Earliest defensible usable instant under a named availability policy. */
  readonly availableAt: Date | null;
  readonly publishedAt?: Date | null;
  readonly sourceAt?: Date | null;
  readonly quality?: MarketObservationQuality;
}

/** Units used by Phase 1 Tier-A market features. */
export type ContextUnit =
  | "index_points"
  | "pct_level"
  | "basis_points"
  | "price"
  | "pct_annualized";

export type FeatureStatus = "ok" | "unavailable" | "invalid_input";

/**
 * Machine-readable reason when a feature cannot be computed.
 * Missing stays null — never fabricate 0.
 */
export type FeatureReasonCode =
  | "ok"
  | "no_eligible_observation"
  | "not_available_before_cutoff"
  | "unknown_availability"
  | "non_finite_value"
  | "invalid_unit"
  | "mismatched_units"
  | "incomplete_window"
  | "non_consecutive_sessions"
  | "missing_observation_date"
  | "date_misaligned"
  | "insufficient_history"
  | "empty_input"
  | "conflict_quarantined";

export interface FeatureInputRef {
  readonly observationId: string;
  readonly seriesKey: string;
  readonly observationDate: string;
  readonly role: "level" | "window_member" | "numerator" | "denominator";
}

export interface FeatureResult {
  readonly featureKey: string;
  readonly definitionVersion: string;
  /** Continuous numeric value, or null when status is not ok. */
  readonly value: number | null;
  readonly unit: ContextUnit;
  readonly status: FeatureStatus;
  readonly reasonCode: FeatureReasonCode;
  readonly cutoff: Date;
  readonly knowledgeMode: KnowledgeMode;
  readonly inputRefs: readonly FeatureInputRef[];
  /** Human-readable detail for logs/tests; never invents economic claims. */
  readonly detail?: string;
}

export interface FeatureComputeRequest {
  readonly cutoff: Date;
  readonly knowledgeMode: KnowledgeMode;
  readonly observations: readonly MarketContextObservation[];
}
