import type { CoverageClaim, DataProviderEntry, DataSeriesEntry, Resolution } from "@/types/dataSources";

const TESTED_ON = "2026-11-27";

function premiumRefusal(resolution: Resolution, start: string, end: string, request: string): CoverageClaim {
  return {
    status: "UNAVAILABLE",
    resolution,
    accessTier: "free_key",
    start,
    end,
    testedOn: TESTED_ON,
    unavailableReason: "premium_only",
    evidence: `${request} returned "This is a premium endpoint" with the free key.`,
  };
}

/** What the premium plan documents. Recorded so the gap is explicit. Never activated. */
const PREMIUM_INTRADAY: CoverageClaim = {
  status: "ADVERTISED",
  resolution: "1m",
  accessTier: "premium",
  start: "2000-01-01",
  end: null,
  citationUrl: "https://www.alphavantage.co/documentation/#intraday",
  evidence:
    "Documented: 1/5/15/30/60-min bars for any month since 2000-01 via month=YYYY-MM. Earlier exercised only on the public demo key (IBM). Not available on the free key.",
};

const DAILY_COMPACT: CoverageClaim = {
  status: "TESTED",
  resolution: "1d",
  accessTier: "free_key",
  start: null,
  end: null,
  rollingWindow: { length: 100, unit: "sessions" },
  testedOn: TESTED_ON,
  evidence: "TIME_SERIES_DAILY (compact) returned 100 sessions, 2026-07-08 → 2026-11-25.",
};

const DAILY_FULL_REFUSED: CoverageClaim = {
  status: "UNAVAILABLE",
  resolution: "1d",
  accessTier: "free_key",
  start: "2022-01-01",
  end: "2026-07-07",
  testedOn: TESTED_ON,
  unavailableReason: "premium_only",
  evidence: 'TIME_SERIES_DAILY outputsize=full returned "outputsize=full is a premium feature". DAILY_ADJUSTED is premium too.',
};

function etf(symbol: string, extra: readonly CoverageClaim[]): DataSeriesEntry {
  return {
    id: `alpha_vantage:${symbol}`,
    providerSeriesId: symbol,
    title: `${symbol} OHLCV`,
    unit: "USD per share (unadjusted)",
    canonicalKeys: [],
    coverage: [...extra, DAILY_COMPACT, DAILY_FULL_REFUSED, PREMIUM_INTRADAY],
    publication: {
      delay: "same_day_eod",
      precision: "date",
      detail: "On 2026-11-27 the daily and weekly series were last refreshed 2026-11-25.",
      availabilityRule: "Daily bar for D is usable no earlier than the next session.",
      basis: "TESTED",
    },
    revisions: {
      kind: "rolling_window_loss",
      detail: "The free daily window keeps the latest 100 sessions only. Older sessions age out.",
      basis: "TESTED",
    },
    pointInTime: {
      status: "INELIGIBLE",
      reason: "The free tier cannot reach 2022–2024 below weekly resolution, and weekly bars are too coarse for event windows.",
      conditions: [],
    },
    notes: ["Not integrated. Do not add as a candle provider at $0."],
  };
}

export const ALPHA_VANTAGE_PROVIDER: DataProviderEntry = {
  id: "alpha_vantage",
  name: "Alpha Vantage",
  operator: "Alpha Vantage Inc.",
  category: "commercial_api",
  homepage: "https://www.alphavantage.co/documentation/",
  auth: {
    kind: "api_key",
    envVars: ["ALPHA_VANTAGE_API_KEY"],
    required: true,
    detail: "Sent as the apikey query parameter. Redact it from every logged URL.",
  },
  freeTier: {
    costUsd: 0,
    limits: [{ value: 25, unit: "requests", per: "day", basis: "DOCUMENTED" }],
    detail:
      "Free key works for TIME_SERIES_DAILY (compact) and TIME_SERIES_WEEKLY. All TIME_SERIES_INTRADAY calls, daily outputsize=full and DAILY_ADJUSTED are premium.",
  },
  licensing: {
    storage: "UNVERIFIED",
    redistribution: "UNVERIFIED",
    attributionRequired: false,
    summary:
      "Terms could not be verified (PDF at terms_of_service/ was not extractable on 2026-11-27 audit). Do not invent licence permissions; treat storage and redistribution as unknown.",
    termsUrl: "https://www.alphavantage.co/terms_of_service/",
    basis: "UNVERIFIED",
  },
  implementations: [],
  lastSuccessfulValidation: TESTED_ON,
  series: [
    etf("SPY", [
      premiumRefusal("1m", "2022-03-01", "2022-03-31", "TIME_SERIES_INTRADAY interval=1min month=2022-03 (compact and full)"),
      premiumRefusal("1m", "2026-11-25", "2026-11-25", "TIME_SERIES_INTRADAY interval=1min (latest, compact)"),
      premiumRefusal("60m", "2022-01-01", "2022-01-31", "TIME_SERIES_INTRADAY interval=60min month=2022-01 extended_hours=false"),
      {
        status: "TESTED",
        resolution: "1w",
        accessTier: "free_key",
        start: "1999-11-12",
        end: "2026-11-25",
        testedOn: TESTED_ON,
        evidence: "TIME_SERIES_WEEKLY returned 1412 unadjusted weekly bars (52 a year for 2022–2024).",
      },
    ]),
    etf("QQQ", [
      premiumRefusal("1m", "2024-06-01", "2024-06-30", "TIME_SERIES_INTRADAY interval=1min month=2024-06"),
      premiumRefusal("5m", "2023-09-01", "2023-09-30", "TIME_SERIES_INTRADAY interval=5min month=2023-09 outputsize=full"),
    ]),
  ],
};
