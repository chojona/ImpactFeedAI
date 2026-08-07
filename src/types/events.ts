/**
 * Shared UI-facing domain types.
 *
 * NOTE: these are the *presentation* types the current Next.js app renders.
 * They are deliberately separate from the Prisma models in
 * `prisma/schema.prisma` (`Event`, `AssetReaction`, `DataRelease`), which use a
 * different vocabulary (`EventType.FED_DECISION` vs `EventCategory.FED`).
 * A mapping layer between the two does not exist yet — see docs/architecture.md.
 */

export type EventCategory =
  | "TARIFF"
  | "FED"
  | "INFLATION"
  | "GEOPOLITICAL"
  | "EARNINGS"
  | "OTHER";

export type AssetType =
  | "STOCK"
  | "CRYPTO"
  | "INDEX"
  | "FOREX"
  | "COMMODITY";

export type Direction = "UP" | "DOWN" | "FLAT";

export interface AssetReaction {
  symbol: string;
  name: string;
  assetType: AssetType;
  percentChange: number;
  direction: Direction;
  openPrice: number;
  closePrice: number;
}

export interface NewsEvent {
  id: string;
  title: string;
  date: string;
  category: EventCategory;
  summary: string;
  explanation: string;
  expectedValue?: string;
  actualValue?: string;
  higherIsBetter: boolean;
  assets: AssetReaction[];
}

export interface ChartDataPoint {
  time: string;
  value: number;
}
