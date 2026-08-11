import type { AssetType } from "@/types/events";

/**
 * Display metadata for the ingested asset universe.
 *
 * `asset_reactions.asset_symbol` is a bare Yahoo ticker, so there is nowhere in
 * the schema to record what an instrument *is*. This table supplies the display
 * name and asset class until an `Instrument` table exists (see
 * docs/architecture.md — "No instrument table").
 *
 * Keep in sync with `ASSET_UNIVERSE` in `scripts/ingest/events-seed.ts`. An
 * unknown symbol degrades to the raw ticker rather than throwing, so a universe
 * change ships data before it ships labels instead of breaking the page.
 */
export interface AssetMeta {
  name: string;
  assetType: AssetType;
}

const ASSET_METADATA: Readonly<Record<string, AssetMeta>> = {
  SPY: { name: "S&P 500", assetType: "INDEX" },
  QQQ: { name: "Nasdaq 100", assetType: "INDEX" },
  IWM: { name: "Russell 2000", assetType: "INDEX" },
  TLT: { name: "20+ Year Treasuries", assetType: "STOCK" },
  GLD: { name: "Gold ETF", assetType: "COMMODITY" },
  "GC=F": { name: "Gold Futures", assetType: "COMMODITY" },
  "CL=F": { name: "WTI Crude", assetType: "COMMODITY" },
  "DX-Y.NYB": { name: "US Dollar Index", assetType: "FOREX" },
  "BTC-USD": { name: "Bitcoin", assetType: "CRYPTO" },
  XLE: { name: "Energy Sector", assetType: "STOCK" },
  XLF: { name: "Financials Sector", assetType: "STOCK" },
  XLK: { name: "Technology Sector", assetType: "STOCK" },
};

export const assetMeta = (symbol: string): AssetMeta =>
  ASSET_METADATA[symbol] ?? { name: symbol, assetType: "STOCK" };

/**
 * Display order: broad equity indices first, then macro (rates, dollar, gold,
 * oil, crypto), then sectors. Symbols outside this list sort last, alphabetically.
 */
const DISPLAY_ORDER: readonly string[] = [
  "SPY",
  "QQQ",
  "IWM",
  "TLT",
  "DX-Y.NYB",
  "GC=F",
  "GLD",
  "CL=F",
  "BTC-USD",
  "XLK",
  "XLF",
  "XLE",
];

const rank = (symbol: string): number => {
  const i = DISPLAY_ORDER.indexOf(symbol);
  return i === -1 ? DISPLAY_ORDER.length : i;
};

export const compareAssetSymbols = (a: string, b: string): number =>
  rank(a) - rank(b) || a.localeCompare(b);
