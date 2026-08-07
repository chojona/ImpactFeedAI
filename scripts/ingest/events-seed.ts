/**
 * 50 curated macro events to bootstrap the database.
 *
 * Timestamps are ISO 8601 with an explicit offset (US Eastern). The pipeline
 * parses them to UTC via `new Date(occurredAt)`. Times are best-effort — use
 * the conventional release time for the event type:
 *   - US economic data: 08:30 ET
 *   - Fed FOMC statement: 14:00 ET
 *   - Earnings: 16:00 ET (after-the-bell call)
 *   - Tariff / geopolitical: use the actual hour where known, else 00:00 ET
 *
 * `expectedValue` may be filled in here for data releases — FRED only ships
 * actuals, so consensus has to be added manually. Leave null if unknown; the
 * pipeline will still record actual + prior from FRED.
 */

export type SeedEventType =
  | "TARIFF"
  | "FED_DECISION"
  | "CPI"
  | "PPI"
  | "NFP"
  | "GEOPOLITICAL"
  | "EARNINGS_SURPRISE"
  | "MACRO_DATA";

export interface SeedEvent {
  headline: string;
  eventType: SeedEventType;
  occurredAt: string; // ISO 8601 with offset
  sourceUrl?: string;
  /** Manually-curated consensus value, if known. Used to populate DataRelease.expectedValue. */
  expectedValue?: number;
  /** Manually-curated metric name, if you want to override the default. */
  metricName?: string;
}

export const SEED_EVENTS: SeedEvent[] = [
  /* ──────────────────────────── TARIFF (11) ──────────────────────────── */
  {
    headline: "Trump announces 25% tariffs on steel and aluminum imports",
    eventType: "TARIFF",
    occurredAt: "2025-02-10T17:00:00-05:00",
  },
  {
    headline:
      "Trump 25% tariffs on Mexico and Canada take effect; 10% on China",
    eventType: "TARIFF",
    occurredAt: "2025-03-04T00:01:00-05:00",
  },
  {
    headline: "Trump signs Section 232 25% tariffs on imported autos",
    eventType: "TARIFF",
    occurredAt: "2025-03-26T16:00:00-04:00",
  },
  {
    headline:
      "Trump announces 10% baseline tariff on all imports plus reciprocal rates",
    eventType: "TARIFF",
    occurredAt: "2025-04-02T16:00:00-04:00",
  },
  {
    headline: "China announces 34% retaliatory tariffs on all US imports",
    eventType: "TARIFF",
    occurredAt: "2025-04-04T08:00:00-04:00",
  },
  {
    headline: "Trump pauses reciprocal tariffs 90 days for non-China countries",
    eventType: "TARIFF",
    occurredAt: "2025-04-09T13:18:00-04:00",
  },
  {
    headline: "US-China tariffs escalate to 145% / 125%",
    eventType: "TARIFF",
    occurredAt: "2025-04-11T08:00:00-04:00",
  },
  {
    headline: "Trump threatens 50% tariff on European Union imports",
    eventType: "TARIFF",
    occurredAt: "2025-05-23T08:00:00-04:00",
  },
  {
    headline: "US Court of International Trade rules IEEPA tariffs unlawful",
    eventType: "TARIFF",
    occurredAt: "2025-05-28T16:30:00-04:00",
  },
  {
    headline: "Trump doubles steel tariff to 50% effective immediately",
    eventType: "TARIFF",
    occurredAt: "2025-06-04T00:01:00-04:00",
  },
  {
    headline: "Federal Circuit upholds CIT ruling against IEEPA tariffs",
    eventType: "TARIFF",
    occurredAt: "2025-08-29T16:00:00-04:00",
  },

  /* ──────────────────────────── FED (7) ──────────────────────────── */
  {
    headline: "Fed hikes 75bps — fourth consecutive jumbo hike",
    eventType: "FED_DECISION",
    occurredAt: "2022-11-02T14:00:00-04:00",
    metricName: "Fed Funds Rate target upper bound",
    expectedValue: 4.0,
  },
  {
    headline: "Fed pauses hiking cycle after ten consecutive hikes",
    eventType: "FED_DECISION",
    occurredAt: "2023-06-14T14:00:00-04:00",
    metricName: "Fed Funds Rate target upper bound",
    expectedValue: 5.25,
  },
  {
    headline: "Fed cuts 50bps — first cut of the cycle, jumbo-sized",
    eventType: "FED_DECISION",
    occurredAt: "2024-09-18T14:00:00-04:00",
    metricName: "Fed Funds Rate target upper bound",
    expectedValue: 5.25,
  },
  {
    headline: "Fed cuts 25bps as expected post-election",
    eventType: "FED_DECISION",
    occurredAt: "2024-11-07T14:00:00-05:00",
    metricName: "Fed Funds Rate target upper bound",
    expectedValue: 4.75,
  },
  {
    headline: "Fed cuts 25bps, dot plot signals fewer 2025 cuts",
    eventType: "FED_DECISION",
    occurredAt: "2024-12-18T14:00:00-05:00",
    metricName: "Fed Funds Rate target upper bound",
    expectedValue: 4.5,
  },
  {
    headline: "Fed holds rates, Powell signals extended pause through Q3",
    eventType: "FED_DECISION",
    occurredAt: "2025-05-07T14:00:00-04:00",
    metricName: "Fed Funds Rate target upper bound",
    expectedValue: 4.5,
  },
  {
    headline: "Powell Jackson Hole speech reinforces data-dependent stance",
    eventType: "FED_DECISION",
    occurredAt: "2025-08-22T10:00:00-04:00",
  },

  /* ──────────────────────────── CPI (7) ──────────────────────────── */
  {
    headline: "June CPI hits 9.1% YoY — highest in 40 years",
    eventType: "CPI",
    occurredAt: "2022-07-13T08:30:00-04:00",
    metricName: "CPI YoY",
    expectedValue: 8.8,
  },
  {
    headline: "October CPI cools to 7.7% YoY, biggest miss since 2008",
    eventType: "CPI",
    occurredAt: "2022-11-10T08:30:00-05:00",
    metricName: "CPI YoY",
    expectedValue: 7.9,
  },
  {
    headline: "January CPI prints hotter at 3.1% YoY",
    eventType: "CPI",
    occurredAt: "2024-02-13T08:30:00-05:00",
    metricName: "CPI YoY",
    expectedValue: 2.9,
  },
  {
    headline: "August CPI cools to 2.5% YoY — lowest since Feb 2021",
    eventType: "CPI",
    occurredAt: "2024-09-11T08:30:00-04:00",
    metricName: "CPI YoY",
    expectedValue: 2.6,
  },
  {
    headline: "December CPI prints 2.9% YoY in line with expectations",
    eventType: "CPI",
    occurredAt: "2025-01-15T08:30:00-05:00",
    metricName: "CPI YoY",
    expectedValue: 2.9,
  },
  {
    headline: "April CPI surprises cool at 2.3% YoY",
    eventType: "CPI",
    occurredAt: "2025-05-13T08:30:00-04:00",
    metricName: "CPI YoY",
    expectedValue: 2.4,
  },
  {
    headline: "May CPI prints 2.4% YoY, tariffs yet to flow through",
    eventType: "CPI",
    occurredAt: "2025-06-11T08:30:00-04:00",
    metricName: "CPI YoY",
    expectedValue: 2.5,
  },

  /* ──────────────────────────── NFP (5) ──────────────────────────── */
  {
    headline: "January 2023 NFP shocks at +517k, unemployment 3.4%",
    eventType: "NFP",
    occurredAt: "2023-02-03T08:30:00-05:00",
    metricName: "Nonfarm payrolls",
    expectedValue: 187,
  },
  {
    headline: "January 2024 NFP +353k crushes consensus",
    eventType: "NFP",
    occurredAt: "2024-02-02T08:30:00-05:00",
    metricName: "Nonfarm payrolls",
    expectedValue: 185,
  },
  {
    headline: "July 2024 NFP misses at +114k, unemployment up to 4.3%",
    eventType: "NFP",
    occurredAt: "2024-08-02T08:30:00-04:00",
    metricName: "Nonfarm payrolls",
    expectedValue: 175,
  },
  {
    headline: "December 2024 NFP +256k, unemployment falls to 4.1%",
    eventType: "NFP",
    occurredAt: "2025-01-10T08:30:00-05:00",
    metricName: "Nonfarm payrolls",
    expectedValue: 165,
  },
  {
    headline: "June 2025 NFP +147k, June revisions cut prior 110k",
    eventType: "NFP",
    occurredAt: "2025-07-03T08:30:00-04:00",
    metricName: "Nonfarm payrolls",
    expectedValue: 110,
  },

  /* ──────────────────────────── PPI (2) ──────────────────────────── */
  {
    headline: "March 2024 PPI hotter at 2.1% YoY, services lead",
    eventType: "PPI",
    occurredAt: "2024-04-11T08:30:00-04:00",
    metricName: "PPI YoY",
    expectedValue: 2.2,
  },
  {
    headline: "January 2025 PPI prints 3.5% YoY, tariff impact begins",
    eventType: "PPI",
    occurredAt: "2025-02-13T08:30:00-05:00",
    metricName: "PPI YoY",
    expectedValue: 3.2,
  },

  /* ──────────────────────────── GEOPOLITICAL (8) ──────────────────────────── */
  {
    headline: "Russia invades Ukraine — markets open in freefall",
    eventType: "GEOPOLITICAL",
    occurredAt: "2022-02-24T05:00:00-05:00",
  },
  {
    headline: "Silicon Valley Bank seized by FDIC, contagion fears spread",
    eventType: "GEOPOLITICAL",
    occurredAt: "2023-03-10T11:00:00-05:00",
  },
  {
    headline: "Credit Suisse rescue forces $17B AT1 wipeout",
    eventType: "GEOPOLITICAL",
    occurredAt: "2023-03-19T16:00:00-04:00",
  },
  {
    headline: "Hamas launches surprise attack on Israel; oil gaps higher",
    eventType: "GEOPOLITICAL",
    occurredAt: "2023-10-07T06:30:00-04:00",
  },
  {
    headline: "Trump survives assassination attempt at PA rally",
    eventType: "GEOPOLITICAL",
    occurredAt: "2024-07-13T18:11:00-04:00",
  },
  {
    headline: "Hezbollah pager attacks trigger Mideast escalation fears",
    eventType: "GEOPOLITICAL",
    occurredAt: "2024-09-17T15:30:00-04:00",
  },
  {
    headline: "Israel strikes Iranian nuclear sites, oil spikes 7%",
    eventType: "GEOPOLITICAL",
    occurredAt: "2025-06-13T02:00:00-04:00",
  },
  {
    headline: "Supreme Court strikes down IEEPA tariffs 6-3",
    eventType: "GEOPOLITICAL",
    occurredAt: "2026-02-24T10:00:00-05:00",
  },

  /* ──────────────────────────── EARNINGS SURPRISE (7) ──────────────────────────── */
  {
    headline: "Microsoft FY24 Q4 Azure decelerates, AI capex spooks investors",
    eventType: "EARNINGS_SURPRISE",
    occurredAt: "2024-07-30T16:05:00-04:00",
  },
  {
    headline: "Google Q3 2024 beats, Cloud accelerates to 35% YoY",
    eventType: "EARNINGS_SURPRISE",
    occurredAt: "2024-10-29T16:00:00-04:00",
  },
  {
    headline: "NVIDIA Q3 FY25 beats but guidance light, AI hype cools",
    eventType: "EARNINGS_SURPRISE",
    occurredAt: "2024-11-20T16:20:00-05:00",
  },
  {
    headline: "Meta Q4 2024 beats, capex guide jolts AI infra trade",
    eventType: "EARNINGS_SURPRISE",
    occurredAt: "2025-01-29T16:05:00-05:00",
  },
  {
    headline: "Apple Q1 FY25 services strength offsets China weakness",
    eventType: "EARNINGS_SURPRISE",
    occurredAt: "2025-01-30T16:30:00-05:00",
  },
  {
    headline: "Tesla Q1 2025 misses big as auto margins collapse",
    eventType: "EARNINGS_SURPRISE",
    occurredAt: "2025-04-22T16:05:00-04:00",
  },
  {
    headline: "NVIDIA Q1 FY26 crushes estimates, data center hits $39B",
    eventType: "EARNINGS_SURPRISE",
    occurredAt: "2025-05-28T16:20:00-04:00",
  },

  /* ──────────────────────────── MACRO_DATA (3) ──────────────────────────── */
  {
    headline: "Q1 2024 US GDP grows just 1.6%, stagflation talk returns",
    eventType: "MACRO_DATA",
    occurredAt: "2024-04-25T08:30:00-04:00",
  },
  {
    headline: "ISM Manufacturing PMI plunges to 46.7, contraction deepens",
    eventType: "MACRO_DATA",
    occurredAt: "2024-08-01T10:00:00-04:00",
  },
  {
    headline: "Q2 2025 GDP advance reading +2.8%, beats consensus",
    eventType: "MACRO_DATA",
    occurredAt: "2025-07-30T08:30:00-04:00",
  },
];

/**
 * The 12-asset universe — fetched for every event. Symbols are Yahoo tickers.
 * If a symbol fails for an event we store nulls and continue (best-effort).
 */
export const ASSET_UNIVERSE: readonly string[] = [
  "SPY", // S&P 500
  "QQQ", // Nasdaq 100
  "IWM", // Russell 2000
  "TLT", // 20yr Treasuries
  "GLD", // Gold ETF
  "GC=F", // Gold Futures
  "CL=F", // Crude Oil
  "DX-Y.NYB", // DXY Dollar Index
  "BTC-USD", // Bitcoin
  "XLE", // Energy sector
  "XLF", // Financials sector
  "XLK", // Tech sector
] as const;