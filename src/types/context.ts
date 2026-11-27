/**
 * Shared Phase 1 market-context contracts.
 *
 * Ownership / merge coordination (extend carefully; do not overwrite siblings):
 * - PR #20 (Agent 03 ALFRED/PIT): owns macro {@link ContextObservation}, vintage
 *   selection, and `revisionSelect.ts`. May also declare the lean market surface
 *   in the same file when merged.
 * - PR #16 (this branch / feature math): owns continuous {@link FeatureResult}
 *   calculators and market PIT eligibility in `src/services/context/`. Keep
 *   {@link MarketContextObservation}, {@link FeatureReasonCode}, and
 *   `sessionCalendar` stable for consumers.
 * - PR #24 (official market adapters, `src/services/market-context/`):
 *   populates {@link MarketContextObservation} (with `fetchedAt`) and marks
 *   FRED current-vintage pulls `revised_latest` with `availableAt: null`, so
 *   they never pass the market PIT gate. Adds the `revised_latest_ineligible`
 *   {@link FeatureReasonCode} (same spelling as macro {@link MissingReason}).
 *   Revision state lives in `quality`, not a separate `revisionKind` field;
 *   `market:SPY:close` is reserved for the equity-price adapter.
 *
 * Shared vocabulary must stay identical across those PRs:
 * `KnowledgeMode`, series keys (`market:VIXCLS:level`, `market:DGS*:yield_pct`,
 * `market:SPY:close`), and strict `availableAt < cutoff` /
 * SYSTEM_REPLAY `fetchedAt < cutoff`.
 *
 * Persistence / Prisma models are intentionally absent here.
 */

import type {
  ActualValueKind,
  AvailabilityQuality,
} from "@/services/macro/actualProvenance";

/**
 * How a query claims knowledge of the information set.
 * Values match Agent 03 Phase 1.1 — do not rename without coordinating.
 */
export type KnowledgeMode =
  | "PUBLIC_INFORMATION_RECONSTRUCTION"
  | "SYSTEM_REPLAY";

/**
 * Quality / eligibility hint on a market observation.
 *
 * `revised_latest` matches PR #24 / Agent 03 vocabulary for current FRED
 * knowledge that is not a verified historical vintage.
 */
export type MarketObservationQuality =
  | "verified"
  | "conservative_date_bound"
  | "revised_latest"
  | "unknown_availability"
  | "missing"
  | "conflict";

/**
 * Lean daily market observation for feature calculators.
 *
 * Distinct from Agent 03's macro `ContextObservation` (vintage/revision heavy).
 * PR #24 adapters emit this shape; Agent 03 may also project selected FRED
 * market series (VIXCLS, DGS*) into it after PIT filtering.
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
   * (yields) and consecutive-session windows (RV / VIX percentile).
   */
  readonly observationDate: string;
  /** Earliest defensible usable instant under a named availability policy. */
  readonly availableAt: Date | null;
  /**
   * When this system locally received the observation.
   * Required for SYSTEM_REPLAY eligibility (`fetchedAt < cutoff`).
   */
  readonly fetchedAt?: Date | null;
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
  | "not_known_to_system"
  | "unknown_availability"
  | "non_finite_value"
  | "invalid_unit"
  | "mismatched_units"
  | "incomplete_window"
  | "non_consecutive_sessions"
  | "missing_observation_date"
  | "impossible_observation_date"
  | "date_misaligned"
  | "insufficient_history"
  | "insufficient_returns"
  | "missing_session_calendar"
  | "invalid_session_calendar"
  | "empty_input"
  | "conflict_quarantined"
  | "revised_latest_ineligible";

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
  /**
   * Independently validated session dates (`YYYY-MM-DD`, ascending unique).
   * Required for equity RV and VIX trailing percentile: missing source rows
   * must not compress the window / claim calendar completeness.
   */
  readonly sessionCalendar?: readonly string[];
}

// ---------------------------------------------------------------------------
// Phase 1.1 macro point-in-time contracts (PR #20). Shared market/feature
// contracts above are owned by PR #16; keep them identical, extend here.
// ---------------------------------------------------------------------------

/**
 * Observation quality for historical macro eligibility.
 * `revised_latest` is current FRED knowledge — never silently promoted to
 * verified historical reconstruction.
 */
export type ObservationQuality =
  | "verified_vintage"
  | "conservative_date_bound"
  | "revised_latest"
  | "unknown_availability"
  | "missing"
  | "conflict";

export type PublicationPrecision = "instant" | "date" | "unknown";

export type ContextReleaseStage =
  | "INITIAL"
  | "PRELIMINARY"
  | "ADVANCE"
  | "SECOND_ESTIMATE"
  | "THIRD_ESTIMATE"
  | "FINAL"
  | "REVISION"
  | "UNKNOWN";

export type MissingReason =
  | "no_observation_for_period"
  | "not_available_before_cutoff"
  | "not_known_to_system"
  | "recorded_after_data_freeze"
  | "unknown_availability"
  | "revised_latest_ineligible"
  | "conflict_quarantined"
  | "insufficient_vintage_panel"
  | "non_finite_value"
  | "mixed_vintage_panel"
  | "untrusted_event_timing";

/**
 * Immutable macro observation with revision / vintage identity.
 * Distinct from lean {@link MarketContextObservation} used by feature math.
 */
export interface ContextObservation {
  readonly id: string;
  readonly seriesKey: string;
  readonly providerSeriesId: string;
  /** YYYY-MM-DD reference-period start. */
  readonly observationPeriodStart: string;
  readonly value: number | null;
  readonly rawValue: string | null;
  readonly unit: string;
  /**
   * Provider revision identity. For ALFRED, typically
   * `${seriesId}:${period}:${realtimeStart}`.
   */
  readonly vintageKey: string;
  readonly realtimeStart: string;
  /** Open-ended current interval uses null rather than inventing an end. */
  readonly realtimeEnd: string | null;
  readonly vintageDate: string | null;
  readonly releaseStage: ContextReleaseStage;
  readonly valueKind: ActualValueKind;
  /** Exact publication instant — never invented from a vintage date. */
  readonly publishedAt: Date | null;
  readonly publicationDate: string | null;
  readonly publicationPrecision: PublicationPrecision;
  readonly availableAt: Date | null;
  readonly availabilityQuality: AvailabilityQuality;
  readonly availabilityPolicyVersion: string | null;
  readonly quality: ObservationQuality;
  readonly fetchedAt: Date;
  readonly recordedAt: Date;
  /** Credential-free HTTPS citation (API keys stripped). */
  readonly sourceUrl: string;
  readonly payloadHash: string;
  readonly ingestionVersion: string;
}

export interface PointInTimePolicy {
  readonly cutoff: Date;
  readonly recordedThrough: Date;
  readonly knowledgeMode: KnowledgeMode;
  /**
   * When true, only INITIAL / INITIAL_REPORTED observations may be selected
   * (e.g. first-print surprise research).
   */
  readonly requireInitial?: boolean;
  /**
   * When false (default), `revised_latest` observations are ineligible for
   * historical reconstruction features.
   */
  readonly allowRevisedLatest?: boolean;
}

export interface SelectionFailure {
  readonly status: "missing";
  readonly reason: MissingReason;
  readonly seriesKey: string;
  readonly observationPeriodStart?: string;
  readonly observationIds: readonly string[];
}

export interface SelectionSuccess {
  readonly status: "selected";
  readonly observation: ContextObservation;
}

export type SelectionResult = SelectionSuccess | SelectionFailure;

export interface ConflictRecord {
  readonly vintageKey: string;
  readonly seriesKey: string;
  readonly observationPeriodStart: string;
  readonly observationIds: readonly string[];
  readonly payloadHashes: readonly string[];
  readonly reason: "conflicting_payload_for_immutable_revision";
}

export interface TransformInputRef {
  readonly role:
    | "numerator"
    | "denominator"
    | "prior_numerator"
    | "prior_denominator";
  readonly observationId: string;
  readonly observationPeriodStart: string;
  readonly vintageKey: string;
}

export interface VintageTransformSuccess {
  readonly status: "ok";
  readonly value: number;
  readonly prior: number | null;
  readonly unit: string;
  readonly inputs: readonly TransformInputRef[];
}

export interface VintageTransformFailure {
  readonly status: "missing";
  readonly reason: MissingReason;
  readonly inputs: readonly TransformInputRef[];
}

export type VintageTransformResult =
  | VintageTransformSuccess
  | VintageTransformFailure;
