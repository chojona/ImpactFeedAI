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
  assets: AssetReaction[];
}

export interface ChartDataPoint {
  time: string;
  value: number;
}
