/**
 * Canonical market-context series catalog.
 *
 * Keys for VIX / DGS2 / DGS10 / SPY match Agent 06 regime feature contracts.
 * Official adapters in this package fetch VIX/yields/breakevens/Fed target;
 * `market:SPY:close` is reserved for equity-price adapters (not implemented here).
 */

import type { ContextUnit } from "@/types/context";
import type { MarketContextProvider } from "@/services/market-context/types";

export const MARKET_SERIES_KEYS = {
  VIXCLS: "market:VIXCLS:level",
  DGS2: "market:DGS2:yield_pct",
  DGS10: "market:DGS10:yield_pct",
  DGS3MO: "market:DGS3MO:yield_pct",
  T5YIE: "market:T5YIE:breakeven_pct",
  T10YIE: "market:T10YIE:breakeven_pct",
  DFEDTARU: "market:DFEDTARU:target_pct",
  DFEDTARL: "market:DFEDTARL:target_pct",
  SPY: "market:SPY:close",
} as const;

export type CanonicalMarketSeriesKey =
  (typeof MARKET_SERIES_KEYS)[keyof typeof MARKET_SERIES_KEYS];

export type SeriesCatalogId = keyof typeof MARKET_SERIES_KEYS;

export interface MarketSeriesDefinition {
  readonly catalogId: SeriesCatalogId;
  readonly seriesKey: CanonicalMarketSeriesKey;
  readonly unit: ContextUnit;
  readonly description: string;
  /** Preferred official publisher for personal research. */
  readonly primaryProvider: MarketContextProvider;
  /** Optional redistributor / mirror (often FRED). */
  readonly mirrorProvider: MarketContextProvider | null;
  /** Native identifier at the primary provider. */
  readonly primaryNativeId: string;
  /** Native identifier at the mirror, when applicable. */
  readonly mirrorNativeId: string | null;
  readonly citationUrls: readonly string[];
  /** Approximate historical start (ISO date), documented not enforced. */
  readonly historyFrom: string;
}

export const MARKET_SERIES_CATALOG: readonly MarketSeriesDefinition[] = [
  {
    catalogId: "VIXCLS",
    seriesKey: MARKET_SERIES_KEYS.VIXCLS,
    unit: "index_points",
    description:
      "Cboe Volatility Index (VIX) daily close. Primary: Cboe CSV; FRED VIXCLS is a copyrighted redistributor mirror.",
    primaryProvider: "cboe",
    mirrorProvider: "fred",
    primaryNativeId: "VIX_History.csv",
    mirrorNativeId: "VIXCLS",
    citationUrls: [
      "https://www.cboe.com/tradable_products/vix/vix_historical_data/",
      "https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv",
      "https://fred.stlouisfed.org/series/VIXCLS",
    ],
    historyFrom: "1990-01-02",
  },
  {
    catalogId: "DGS2",
    seriesKey: MARKET_SERIES_KEYS.DGS2,
    unit: "pct_level",
    description:
      "2-year Treasury constant-maturity / par yield. Primary: US Treasury Daily Par Yield Curve (BC_2YEAR); FRED DGS2 mirror.",
    primaryProvider: "us_treasury",
    mirrorProvider: "fred",
    primaryNativeId: "BC_2YEAR",
    mirrorNativeId: "DGS2",
    citationUrls: [
      "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve",
      "https://fred.stlouisfed.org/series/DGS2",
    ],
    historyFrom: "1990-01-02",
  },
  {
    catalogId: "DGS10",
    seriesKey: MARKET_SERIES_KEYS.DGS10,
    unit: "pct_level",
    description:
      "10-year Treasury constant-maturity / par yield. Primary: US Treasury BC_10YEAR; FRED DGS10 mirror.",
    primaryProvider: "us_treasury",
    mirrorProvider: "fred",
    primaryNativeId: "BC_10YEAR",
    mirrorNativeId: "DGS10",
    citationUrls: [
      "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve",
      "https://fred.stlouisfed.org/series/DGS10",
    ],
    historyFrom: "1990-01-02",
  },
  {
    catalogId: "DGS3MO",
    seriesKey: MARKET_SERIES_KEYS.DGS3MO,
    unit: "pct_level",
    description:
      "3-month Treasury constant-maturity / par yield. Primary: US Treasury BC_3MONTH; FRED DGS3MO mirror.",
    primaryProvider: "us_treasury",
    mirrorProvider: "fred",
    primaryNativeId: "BC_3MONTH",
    mirrorNativeId: "DGS3MO",
    citationUrls: [
      "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve",
      "https://fred.stlouisfed.org/series/DGS3MO",
    ],
    historyFrom: "1990-01-02",
  },
  {
    catalogId: "T5YIE",
    seriesKey: MARKET_SERIES_KEYS.T5YIE,
    unit: "pct_level",
    description:
      "5-year inflation breakeven (percent). FRED constructs from DGS5 and DFII5; no separate free daily Treasury feed.",
    primaryProvider: "fred",
    mirrorProvider: null,
    primaryNativeId: "T5YIE",
    mirrorNativeId: null,
    citationUrls: ["https://fred.stlouisfed.org/series/T5YIE"],
    historyFrom: "2003-01-02",
  },
  {
    catalogId: "T10YIE",
    seriesKey: MARKET_SERIES_KEYS.T10YIE,
    unit: "pct_level",
    description:
      "10-year inflation breakeven (percent). FRED constructs from DGS10 and DFII10.",
    primaryProvider: "fred",
    mirrorProvider: null,
    primaryNativeId: "T10YIE",
    mirrorNativeId: null,
    citationUrls: ["https://fred.stlouisfed.org/series/T10YIE"],
    historyFrom: "2003-01-02",
  },
  {
    catalogId: "DFEDTARU",
    seriesKey: MARKET_SERIES_KEYS.DFEDTARU,
    unit: "pct_level",
    description:
      "Federal funds target range upper limit (percent). FRED redistributes Board of Governors FOMC series; daily 7-day calendar.",
    primaryProvider: "fred",
    mirrorProvider: null,
    primaryNativeId: "DFEDTARU",
    mirrorNativeId: null,
    citationUrls: ["https://fred.stlouisfed.org/series/DFEDTARU"],
    historyFrom: "2008-12-16",
  },
  {
    catalogId: "DFEDTARL",
    seriesKey: MARKET_SERIES_KEYS.DFEDTARL,
    unit: "pct_level",
    description:
      "Federal funds target range lower limit (percent). Companion to DFEDTARU.",
    primaryProvider: "fred",
    mirrorProvider: null,
    primaryNativeId: "DFEDTARL",
    mirrorNativeId: null,
    citationUrls: ["https://fred.stlouisfed.org/series/DFEDTARL"],
    historyFrom: "2008-12-16",
  },
  {
    catalogId: "SPY",
    seriesKey: MARKET_SERIES_KEYS.SPY,
    unit: "price",
    description:
      "SPY daily close reserved for equity RV20 / session-calendar features. No official adapter in this package — equity-price providers populate it separately.",
    primaryProvider: "equity_price",
    mirrorProvider: null,
    primaryNativeId: "SPY",
    mirrorNativeId: null,
    citationUrls: ["https://finance.yahoo.com/quote/SPY"],
    historyFrom: "1993-01-29",
  },
] as const;

const byCatalogId = new Map(
  MARKET_SERIES_CATALOG.map((entry) => [entry.catalogId, entry]),
);

const bySeriesKey = new Map(
  MARKET_SERIES_CATALOG.map((entry) => [entry.seriesKey, entry]),
);

export function marketSeriesByCatalogId(
  catalogId: SeriesCatalogId,
): MarketSeriesDefinition {
  const entry = byCatalogId.get(catalogId);
  if (!entry) {
    throw new Error(`Unknown market series catalog id: ${catalogId}`);
  }
  return entry;
}

export function marketSeriesByKey(
  seriesKey: string,
): MarketSeriesDefinition | null {
  return bySeriesKey.get(seriesKey as CanonicalMarketSeriesKey) ?? null;
}

export const PRIORITY_SERIES_CATALOG_IDS: readonly SeriesCatalogId[] = [
  "VIXCLS",
  "DGS2",
  "DGS10",
  "DGS3MO",
  "T5YIE",
  "T10YIE",
  "DFEDTARU",
  "DFEDTARL",
] as const;
