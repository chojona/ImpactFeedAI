/**
 * Machine-readable data-source registry types.
 *
 * The registry answers, per provider and per series, the questions that must be
 * settled before any number from that source is trusted:
 *
 *   - what history exists, at which resolution, and HOW we know it
 *     (tested by a live request vs. advertised by the provider vs. unavailable);
 *   - what the free tier allows, and what needs a key;
 *   - when a value becomes public and whether it is revised later;
 *   - whether it can feed a point-in-time (no-lookahead) reconstruction;
 *   - what the licence lets us store or redistribute.
 *
 * It is metadata only. It never fetches, never stores provider payloads and
 * never holds credentials: `auth.envVars` names environment variables, it does
 * not contain their values.
 */

/** Calendar date in ISO `YYYY-MM-DD` form. */
export type IsoDate = string;

/**
 * How a coverage claim is known.
 *
 * - `TESTED`: a live request (or, for the local archive, a read of its own
 *   manifests) returned this data on `testedOn`.
 * - `ADVERTISED`: the provider documents it, but nothing here has exercised it.
 * - `UNAVAILABLE`: the data cannot be obtained under the stated access tier.
 *   When `testedOn` is set, the refusal was observed live; otherwise it rests on
 *   the cited documentation.
 */
export type CoverageStatus = "TESTED" | "ADVERTISED" | "UNAVAILABLE";

/** Basis for a non-coverage statement (limits, licensing, timing, revisions). */
export type EvidenceBasis =
  | "TESTED" // observed in a live request
  | "DOCUMENTED" // read in the provider's own documentation or data file
  | "THIRD_PARTY" // community or secondary source, not the provider
  | "UNVERIFIED"; // believed, not checked — treat as unknown

export type Resolution =
  | "1m"
  | "5m"
  | "15m"
  | "30m"
  | "60m"
  | "1d"
  | "1w"
  | "1mo"
  | "1q"
  | "per_vintage" // one row per published vintage of a series
  | "per_event"; // one row per discrete event (FOMC meeting, auction)

/** Who can obtain the data described by a claim. */
export type AccessTier =
  | "anonymous" // no credentials
  | "free_key" // free registered key
  | "premium" // paid plan — documented for context, never activated here
  | "local_licensed"; // already-purchased data held on local disk

export type UnavailableReason =
  | "premium_only"
  | "outside_rolling_window"
  | "not_published"
  | "not_licensed"
  | "refused_by_provider";

/** A window anchored to the request time rather than to fixed dates. */
export interface RollingWindow {
  readonly length: number;
  readonly unit: "days" | "sessions";
}

export interface CoverageClaim {
  readonly status: CoverageStatus;
  readonly resolution: Resolution;
  readonly accessTier: AccessTier;
  /**
   * First observation date covered (or, for UNAVAILABLE, first date of the
   * range that was refused). Null for rolling windows.
   */
  readonly start: IsoDate | null;
  /** Last observation date covered. Null for rolling windows. */
  readonly end: IsoDate | null;
  readonly rollingWindow?: RollingWindow;
  /** Required for TESTED; optional for UNAVAILABLE (observed refusal). */
  readonly testedOn?: IsoDate;
  /** Required for ADVERTISED, and for UNAVAILABLE without `testedOn`. */
  readonly citationUrl?: string;
  /** Required for UNAVAILABLE. */
  readonly unavailableReason?: UnavailableReason;
  /** What request or document established the claim. */
  readonly evidence: string;
}

export interface PublicationTiming {
  readonly delay:
    | "realtime" // bars available as the session trades
    | "same_day_eod" // published after the close of the observation day
    | "next_business_day"
    | "scheduled_release" // published on an official release calendar
    | "periodic_update" // irregular research-file updates
    | "static_archive"; // historical file, no further publication
  /** Precision at which the moment of public availability is known. */
  readonly precision: "instant" | "date" | "unknown";
  readonly detail: string;
  /** Conservative rule for `availableAt`, or null when none is defined yet. */
  readonly availabilityRule: string | null;
  readonly basis: EvidenceBasis;
}

export interface RevisionBehavior {
  readonly kind:
    | "none" // values are final when first published
    | "revised_with_vintages" // revised, and earlier vintages are retrievable
    | "revised_without_vintages" // revised in place; earlier values are lost
    | "restated_with_changelog" // corrections recorded in a changelog only
    | "rolling_window_loss" // history ages out of the provider's window
    | "unknown";
  readonly detail: string;
  readonly basis: EvidenceBasis;
}

/**
 * Whether values can feed a point-in-time reconstruction.
 *
 * - `ELIGIBLE`: usable as-is at the stated publication precision.
 * - `CONDITIONAL`: usable only once every listed condition is met.
 * - `INELIGIBLE`: must not feed point-in-time work (e.g. current-vintage values
 *   standing in for first prints).
 */
export interface PointInTimeEligibility {
  readonly status: "ELIGIBLE" | "CONDITIONAL" | "INELIGIBLE";
  readonly reason: string;
  readonly conditions: readonly string[];
}

export interface DataSeriesEntry {
  /**
   * Registry-unique id, `<providerId>:<slug>`. The slug is the provider series
   * id when that is URL-safe (`fred:PAYEMS`), otherwise a stable short name.
   */
  readonly id: string;
  /** Identifier exactly as the provider spells it. */
  readonly providerSeriesId: string;
  readonly title: string;
  /** Stored or provider unit, verbatim. */
  readonly unit: string;
  /** Repository keys this series feeds (`market:VIXCLS:level`, metric names). */
  readonly canonicalKeys: readonly string[];
  readonly coverage: readonly CoverageClaim[];
  readonly publication: PublicationTiming;
  readonly revisions: RevisionBehavior;
  readonly pointInTime: PointInTimeEligibility;
  readonly notes: readonly string[];
}

export interface RateLimit {
  readonly value: number;
  readonly unit: "requests" | "series" | "years" | "days" | "observations";
  readonly per: "day" | "minute" | "request";
  /** True when the limit applies only with a key, false only without one. */
  readonly withKey?: boolean;
  readonly basis: EvidenceBasis;
  readonly note?: string;
}

export type Permission = "PERMITTED" | "RESTRICTED" | "PROHIBITED" | "UNVERIFIED";

export interface LicensingTerms {
  /** Durable local storage of fetched values (database, files). */
  readonly storage: Permission;
  /** Republishing values to other people. */
  readonly redistribution: Permission;
  readonly attributionRequired: boolean;
  readonly summary: string;
  readonly termsUrl: string | null;
  readonly basis: EvidenceBasis;
}

export interface AuthRequirement {
  readonly kind: "none" | "api_key" | "local_path";
  /** Environment variable NAMES. Values never appear in the registry. */
  readonly envVars: readonly string[];
  readonly required: boolean;
  readonly detail: string;
}

export interface FreeTier {
  /** Marginal cost of every use this registry describes. */
  readonly costUsd: 0;
  readonly limits: readonly RateLimit[];
  readonly detail: string;
}

/** Where code that talks to the provider lives. Empty when nothing is built. */
export interface ImplementationRef {
  readonly status: "MAIN" | "OPEN_PR";
  readonly path: string;
  readonly pullRequest?: number;
}

export type ProviderCategory =
  | "government_statistics"
  | "central_bank"
  | "exchange"
  | "commercial_api"
  | "unofficial_api"
  | "local_archive";

export interface DataProviderEntry {
  readonly id: string;
  readonly name: string;
  readonly operator: string;
  readonly category: ProviderCategory;
  readonly homepage: string;
  readonly auth: AuthRequirement;
  readonly freeTier: FreeTier;
  readonly licensing: LicensingTerms;
  readonly implementations: readonly ImplementationRef[];
  /**
   * Most recent `testedOn` among this provider's TESTED claims, i.e. the last
   * day a live request actually returned data. Null when never validated.
   */
  readonly lastSuccessfulValidation: IsoDate | null;
  readonly series: readonly DataSeriesEntry[];
}

export interface DataSourceRegistry {
  readonly schemaVersion: 1;
  /** Date the registry content was last reviewed as a whole. */
  readonly asOf: IsoDate;
  readonly providers: readonly DataProviderEntry[];
}
