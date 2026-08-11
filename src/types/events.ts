/**
 * Shared domain types.
 *
 * `NewsEvent` and friends are the *presentation* shape the Next.js app renders.
 * They are produced from the Prisma models (`Event`, `AssetReaction`,
 * `DataRelease`) by `src/services/events/mapEvent.ts` — the two vocabularies
 * still differ deliberately:
 *
 *   - `EventTypeName` mirrors the Prisma `EventType` enum one-for-one. It is the
 *     storage vocabulary and the thing filters translate into.
 *   - `EventCategory` is the coarser vocabulary the UI groups by. Several event
 *     types collapse into one category (CPI and PPI are both INFLATION), so the
 *     mapping is many-to-one and lives in `src/lib/eventCategories.ts`.
 *
 * Nullability here is load-bearing. Every field the database can leave unset is
 * `| null` all the way to the component, because the alternative — defaulting a
 * missing price move to 0 or a missing prior to "unchanged" — turns absent data
 * into a fabricated observation.
 */

/** Mirrors the Prisma `EventType` enum exactly. */
export type EventTypeName =
  | "TARIFF"
  | "FED_DECISION"
  | "CPI"
  | "PPI"
  | "NFP"
  | "GEOPOLITICAL"
  | "EARNINGS_SURPRISE"
  | "MACRO_DATA";

export type EventCategory =
  | "TARIFF"
  | "FED"
  | "INFLATION"
  | "JOBS"
  | "GEOPOLITICAL"
  | "EARNINGS"
  | "OTHER";

export type AssetType = "STOCK" | "CRYPTO" | "INDEX" | "FOREX" | "COMMODITY";

export type Direction = "UP" | "DOWN" | "FLAT";

/** The reaction windows the schema currently stores. */
export type ReactionWindow = "1h" | "1d" | "1w";

/** Mirrors the Prisma timing-provenance enum without importing generated code. */
export type EventTimingStatus =
  | "VERIFIED"
  | "SCHEDULED"
  | "INFERRED"
  | "DATE_ONLY"
  | "REFERENCE_PERIOD_ONLY"
  | "UNVERIFIED";

/** Mirrors the Prisma consensus-provenance enum. */
export type ConsensusStatus = "VERIFIED" | "UNVERIFIED" | "MISSING";

export type ReactionTimingIneligibility =
  | "untrusted_status"
  | "missing_release_timestamp"
  | "missing_timing_source";

export interface EventTimingView {
  status: EventTimingStatus;
  /** Exact release instant, when known. ISO 8601 UTC. */
  releaseAt: string | null;
  /** Official publication date without an invented time, YYYY-MM-DD. */
  releaseDate: string | null;
  /** Human-readable provenance identifying the calendar or release record. */
  source: string | null;
  reactionEligible: boolean;
  ineligibilityReason: ReactionTimingIneligibility | null;
}

export interface AssetReaction {
  symbol: string;
  name: string;
  assetType: AssetType;
  /** Price the reaction is measured from. Always present — the row requires it. */
  priceAtEvent: number;
  price1h: number | null;
  price1d: number | null;
  price1w: number | null;
  pct1h: number | null;
  pct1d: number | null;
  pct1w: number | null;
  /** Actual candle used as the return baseline. ISO 8601 UTC. */
  anchorAt: string | null;
  calculationVersion: number;
  /**
   * The feed and aggregate headline use one fixed horizon: one trading session.
   * Other measured windows remain available on the detail view.
   */
  primaryWindow: ReactionWindow | null;
  /** Percent change over `primaryWindow`. Null when nothing was measurable. */
  percentChange: number | null;
  /** Null when `percentChange` is null — not FLAT, which would assert no move. */
  direction: Direction | null;
}

/** A macro release, pre-formatted in the metric's canonical unit. */
export interface DataReleaseView {
  metricKey: string | null;
  metricName: string;
  /** Reference period measured by the statistic, never a publication date. */
  referencePeriodStart: string | null;
  expectedValue: number | null;
  actualValue: number | null;
  priorValue: number | null;
  surpriseMagnitude: number | null;
  expected: string | null;
  actual: string | null;
  prior: string | null;
  /** Signed (actual − expected), formatted in percentage points or k jobs. */
  surprise: string | null;
  /** Raw signed surprise, for colouring. Null when there is no consensus. */
  surpriseValue: number | null;
  actualSource: string | null;
  actualSourceUrl: string | null;
  consensusStatus: ConsensusStatus;
  consensusSource: string | null;
  consensusSourceUrl: string | null;
  /** When the consensus snapshot was observed, as an ISO 8601 UTC instant. */
  consensusAsOf: string | null;
}

export interface NewsEvent {
  id: string;
  title: string;
  /** Preferred display instant: release time when known, otherwise occurrence. */
  date: string;
  /** Original event occurrence field retained separately from release timing. */
  occurredAt: string;
  timing: EventTimingView;
  eventType: EventTypeName;
  category: EventCategory;
  /** Factual line derived from the stored release. Null when there is no release. */
  summary: string | null;
  /** Long-form commentary. Null until something populates `Event.explanation`. */
  explanation: string | null;
  sourceUrl: string | null;
  /** First release in deterministic metric order, retained for feed compatibility. */
  release: DataReleaseView | null;
  releases: DataReleaseView[];
  assets: AssetReaction[];
}

/**
 * One point on an asset's reaction path: cumulative percent change from the
 * event anchor at a measured window. `label` carries the window identity
 * because the windows are unevenly spaced in time (see `ReactionSparkline`).
 */
export interface ReactionSeriesPoint {
  label: string;
  value: number;
}
