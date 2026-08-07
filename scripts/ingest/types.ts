/**
 * Shared types for the ingestion pipeline.
 */

export interface PriceSnapshot {
  priceAtEvent: number; // anchor — caller skips the asset if null
  price1h: number | null;
  price1d: number | null;
  price1w: number | null;
}

export interface AssetReactionRow extends PriceSnapshot {
  assetSymbol: string;
  pctChange1h: number | null;
  pctChange1d: number | null;
  pctChange1w: number | null;
}

export interface MacroRelease {
  metricName: string;
  actualValue: number | null;
  priorValue: number | null;
  expectedValue: number | null;
  surpriseMagnitude: number | null;
}