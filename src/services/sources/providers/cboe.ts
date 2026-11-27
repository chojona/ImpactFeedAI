import type { DataProviderEntry, DataSeriesEntry } from "@/types/dataSources";

const TESTED_ON = "2026-11-27";
const CSV_BASE = "https://cdn.cboe.com/api/global/us_indices/daily_prices";

function volIndex(
  symbol: string,
  title: string,
  canonicalKeys: readonly string[],
  start: string,
  end: string,
  rows: number,
  notes: readonly string[],
): DataSeriesEntry {
  return {
    id: `cboe:${symbol}`,
    providerSeriesId: symbol,
    title,
    unit: "Index points (OHLC)",
    canonicalKeys,
    coverage: [
      {
        status: "TESTED",
        resolution: "1d",
        accessTier: "anonymous",
        start,
        end,
        testedOn: TESTED_ON,
        evidence: `GET ${CSV_BASE}/${symbol}_History.csv (redirects to cdn-api.cboe.com) returned ${rows} data rows.`,
      },
      {
        status: "UNAVAILABLE",
        resolution: "1m",
        accessTier: "anonymous",
        start: null,
        end: null,
        unavailableReason: "refused_by_provider",
        citationUrl: "https://www.cboe.com/tradable_products/vix/",
        evidence: "The delayed-quote chart JSON sits behind a Cloudflare challenge (data-acquisition plan). Intraday history is a paid DataShop product.",
      },
    ],
    publication: {
      delay: "same_day_eod",
      precision: "date",
      detail: "End-of-day file refreshed daily. The CDN refresh time is not a verified publication instant.",
      availabilityRule: "availableAt = start of the next calendar day (conservative date bound).",
      basis: "TESTED",
    },
    revisions: {
      kind: "unknown",
      detail: "The file is regenerated in place. Corrections, if any, are not versioned.",
      basis: "UNVERIFIED",
    },
    pointInTime: {
      status: "CONDITIONAL",
      reason: "Date precision only, and rows are not validated against the exchange calendar.",
      conditions: [
        "Apply the conservative next-day availability bound.",
        "Drop or flag rows on NYSE holidays.",
      ],
    },
    notes,
  };
}

export const CBOE_PROVIDER: DataProviderEntry = {
  id: "cboe",
  name: "Cboe index daily history files",
  operator: "Cboe Global Markets",
  category: "exchange",
  homepage: "https://www.cboe.com/tradable_products/vix/vix_historical_data/",
  auth: { kind: "none", envVars: [], required: false, detail: "Public CSV files. Follow the 307 redirect to cdn-api.cboe.com." },
  freeTier: { costUsd: 0, limits: [], detail: "No published rate limit found. Fetch at most once per day." },
  licensing: {
    storage: "UNVERIFIED",
    redistribution: "RESTRICTED",
    attributionRequired: true,
    summary:
      "Index values are Cboe intellectual property. The free history file supports personal research. Do not republish the series wholesale. Full terms not reviewed.",
    termsUrl: null,
    basis: "THIRD_PARTY",
  },
  implementations: [{ status: "OPEN_PR", path: "src/services/market-context/cboe.ts", pullRequest: 24 }],
  lastSuccessfulValidation: TESTED_ON,
  series: [
    volIndex("VIX", "Cboe Volatility Index", ["market:VIXCLS:level"], "1990-01-02", "2026-11-26", 9325, [
      "Pre-2003 values are methodology backfills, not contemporaneous prints.",
      "Contains a 2026-11-26 (Thanksgiving) row.",
    ]),
    volIndex("VIX3M", "Cboe 3-Month Volatility Index", [], "2009-09-18", "2026-11-25", 4324, [
      "FRED VXVCLS starts earlier (2007-12-04). Cross-check the overlap.",
    ]),
    volIndex("VIX9D", "Cboe 9-Day Volatility Index", [], "2011-01-04", "2026-11-25", 3998, []),
  ],
};
