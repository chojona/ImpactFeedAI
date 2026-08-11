/**
 * Shared types for the ingestion pipeline.
 */

export interface PriceSnapshot {
  /**
   * Strictly pre-release baseline price. The legacy field name is retained by
   * the existing schema; it no longer means the first price after the event.
   */
  priceAtEvent: number;
  /**
   * Provider timestamp of the baseline bar, persisted for UI/audit disclosure.
   * For a daily-close fallback Yahoo stamps the bar at session open, because it
   * does not supply a separate close timestamp; this identifies the source bar
   * rather than claiming exact closing-tick precision.
   */
  anchorAt: Date;
  price1h: number | null;
  price1d: number | null;
  price1w: number | null;
}

export interface AssetReactionRow {
  assetSymbol: string;
  /** Provider timestamp identifying the strictly pre-release baseline bar. */
  anchorAt: Date;
  /** Bumped whenever the financial definition of a stored reaction changes. */
  calculationVersion: number;
  priceAtEvent: number;
  price1h: number | null;
  price1d: number | null;
  price1w: number | null;
  pctChange1h: number | null;
  pctChange1d: number | null;
  pctChange1w: number | null;
}

export interface MacroRelease {
  /** Stable identity from the canonical metric registry. */
  metricKey: string;
  metricName: string;
  /** Period the observation describes; never a substitute for its release time. */
  referencePeriodStart: Date | null;
  actualValue: number | null;
  priorValue: number | null;
  expectedValue: number | null;
  surpriseMagnitude: number | null;
  actualSource: string | null;
  actualSourceUrl: string | null;
  consensusStatus: "VERIFIED" | "UNVERIFIED" | "MISSING";
  consensusSource: string | null;
  consensusSourceUrl: string | null;
  consensusAsOf: Date | null;
}
