import type { CoverageClaim, DataProviderEntry, DataSeriesEntry, PublicationTiming } from "@/types/dataSources";

const TESTED_ON = "2026-11-27";

const TIMING: PublicationTiming = {
  delay: "realtime",
  precision: "instant",
  detail: "Intraday bars carry bar-open timestamps. The 2026-11-27 probes returned bars from the current session.",
  availabilityRule: "A bar is available at its open + interval (bar close).",
  basis: "TESTED",
};

function rolling(resolution: CoverageClaim["resolution"], days: number, evidence: string): CoverageClaim {
  return {
    status: "TESTED",
    resolution,
    accessTier: "anonymous",
    start: null,
    end: null,
    rollingWindow: { length: days, unit: "days" },
    testedOn: TESTED_ON,
    evidence,
  };
}

function refused(resolution: CoverageClaim["resolution"], evidence: string): CoverageClaim {
  return {
    status: "UNAVAILABLE",
    resolution,
    accessTier: "anonymous",
    start: "2022-03-01",
    end: "2022-03-04",
    testedOn: TESTED_ON,
    unavailableReason: "outside_rolling_window",
    evidence,
  };
}

function etf(symbol: string, coverage: readonly CoverageClaim[]): DataSeriesEntry {
  return {
    id: `yahoo:${symbol}`,
    providerSeriesId: symbol,
    title: `${symbol} OHLCV`,
    unit: "USD per share. Intraday as-traded, daily split-adjusted",
    canonicalKeys: symbol === "SPY" ? ["market:SPY:close"] : [],
    coverage,
    publication: TIMING,
    revisions: {
      kind: "rolling_window_loss",
      detail:
        "Intraday history ages out of the 30/60/730-day windows permanently. Daily OHLC is restated on splits, with no vintage.",
      basis: "TESTED",
    },
    pointInTime: {
      status: "CONDITIONAL",
      reason: "Timestamps are exact, but older intraday history is lost and daily levels are restated.",
      conditions: [
        "Intraday: only bars archived while inside the provider window.",
        "Daily: use returns, not levels, and record Candle.priceBasis.",
        "Yahoo ToS §2(d)(9)/(10): no automated collection without express prior permission; no database/archive/data feed that competes with or constitutes a material substitute for Yahoo's Services (candle-source permissions gate).",
      ],
    },
    notes: ["Extended-hours bars report volume 0. Store it as NULL, not 0."],
  };
}

export const YAHOO_PROVIDER: DataProviderEntry = {
  id: "yahoo",
  name: "Yahoo Finance via yahoo-finance2",
  operator: "Yahoo (unofficial API, community library)",
  category: "unofficial_api",
  homepage: "https://github.com/gadicc/yahoo-finance2",
  auth: { kind: "none", envVars: [], required: false, detail: "No key. Unofficial endpoints can change without notice." },
  freeTier: {
    costUsd: 0,
    limits: [
      { value: 8, unit: "days", per: "request", basis: "TESTED", note: "1m only: 'Only 8 days worth of 1m granularity data are allowed to be fetched per request'." },
    ],
    detail: "Throttles under load. The pipeline waits 500 ms per symbol and backs off 30 s after repeated failures.",
  },
  licensing: {
    storage: "RESTRICTED",
    redistribution: "PROHIBITED",
    attributionRequired: false,
    summary:
      "https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html §2(d)(9) no automated collection without express prior permission; §2(d)(10) no creating a database/archive/data feed that competes with or constitutes a material substitute for the Services or Yahoo/data-provider offerings; §2(e) no commercial purpose; §2(h) no reproduce, modify, rent, lease, sell, trade, distribute, transmit, broadcast, publicly perform, create derivative works based on, or exploit for any commercial purposes without explicit written permission. Cautious reading: storage RESTRICTED; redistribution PROHIBITED.",
    termsUrl: "https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html",
    basis: "DOCUMENTED",
  },
  implementations: [
    { status: "MAIN", path: "scripts/ingest/fetch-prices.ts" },
    { status: "MAIN", path: "scripts/backfill/backfill-candles.ts" },
    { status: "MAIN", path: "scripts/ingest/candle-provider.ts" },
    { status: "MAIN", path: "scripts/ingest/candle-source-permissions.ts" },
    { status: "MAIN", path: "scripts/ingest/candle-preservation-plan.ts" },
  ],
  lastSuccessfulValidation: TESTED_ON,
  series: [
    etf("SPY", [
      rolling("1m", 30, "chart() 1m in two 7-day requests returned 3728 bars (2026-11-20 → 11-27) and 4492 bars (2026-10-29 → 11-05). A single 29-day request is refused (8-day cap)."),
      refused("1m", "chart() 1m for 2022-03-01..05: 'The requested range must be within the last 30 days.'"),
      rolling("60m", 730, "chart() 1h over 729 days returned 8273 bars, 2024-11-29 → 2026-11-27."),
      {
        status: "TESTED",
        resolution: "1d",
        accessTier: "anonymous",
        start: "1993-01-29",
        end: "2026-11-27",
        testedOn: TESTED_ON,
        evidence: "chart() 1d from 1990 returned 8516 bars starting 1993-01-29.",
      },
    ]),
    etf("QQQ", [
      rolling("5m", 60, "chart() 5m over 59 days returned 7563 bars including extended hours."),
      refused("60m", "chart() 1h for 2022-03-01..05: 'The requested range must be within the last 730 days.'"),
      {
        status: "TESTED",
        resolution: "1d",
        accessTier: "anonymous",
        start: "1999-03-10",
        end: "2026-11-27",
        testedOn: TESTED_ON,
        evidence: "chart() 1d from 1990 returned 6974 bars starting 1999-03-10.",
      },
    ]),
  ],
};
