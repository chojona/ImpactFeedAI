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

export const CATEGORY_CONFIG: Record<
  EventCategory,
  { higherIsBetter: boolean; color: string }
> = {
  TARIFF: { higherIsBetter: false, color: "#FF6B35" },
  FED: { higherIsBetter: false, color: "#A78BFA" },
  INFLATION: { higherIsBetter: false, color: "#EF4444" },
  GEOPOLITICAL: { higherIsBetter: false, color: "#F59E0B" },
  EARNINGS: { higherIsBetter: true, color: "#3B82F6" },
  OTHER: { higherIsBetter: true, color: "#6B7280" },
};
