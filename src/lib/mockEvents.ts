import type { NewsEvent } from "./types";

export const mockEvents: NewsEvent[] = [
  {
    id: "trump-liberation-day-tariffs-2025",
    title: "Trump Announces Sweeping 'Liberation Day' Reciprocal Tariffs",
    date: "2025-04-03",
    category: "TARIFF",
    higherIsBetter: false,
    summary:
      "A 10% baseline tariff on all imports plus reciprocal rates of 20–49% triggered the worst equity session since the 2020 COVID crash.",
    explanation:
      "On April 2, 2025, the Trump administration unveiled its 'Liberation Day' tariff package: a 10% baseline tariff on virtually all imports, with reciprocal rates of 20–49% targeting countries running large trade surpluses with the US. The breadth and speed of implementation caught markets off guard, with cyclicals and semiconductors leading declines. The dollar paradoxically weakened as traders priced in growth damage and faster Fed cuts, while Treasuries rallied on flight-to-safety bids. Gold initially spiked but ended sharply lower as forced liquidations cascaded across even safe-haven positioning.",
    assets: [
      { symbol: "SPY", name: "S&P 500", assetType: "INDEX", percentChange: -4.84, direction: "DOWN", openPrice: 564.52, closePrice: 537.18 },
      { symbol: "NQ", name: "Nasdaq 100", assetType: "INDEX", percentChange: -5.97, direction: "DOWN", openPrice: 19342.5, closePrice: 18187.75 },
      { symbol: "GC", name: "Gold", assetType: "COMMODITY", percentChange: -2.49, direction: "DOWN", openPrice: 3164.8, closePrice: 3086.0 },
      { symbol: "DXY", name: "US Dollar Index", assetType: "FOREX", percentChange: -1.67, direction: "DOWN", openPrice: 103.85, closePrice: 102.12 },
      { symbol: "BTC", name: "Bitcoin", assetType: "CRYPTO", percentChange: -3.14, direction: "DOWN", openPrice: 86840, closePrice: 84112 },
    ],
  },
  {
    id: "trump-90-day-pause-april-2025",
    title: "Trump Announces 90-Day Tariff Pause; Markets Stage Historic Rally",
    date: "2025-04-09",
    category: "TARIFF",
    higherIsBetter: true,
    summary:
      "Trump paused reciprocal tariffs for 90 days for non-China countries, triggering one of the largest single-day equity rallies on record.",
    explanation:
      "Just thirteen hours after the punitive reciprocal tariffs took effect, President Trump announced a 90-day pause for countries that hadn't retaliated, dropping the rate to a baseline 10% during negotiations. China was excluded — its rate was simultaneously raised to 125% — but the de-escalation for everyone else was enough to ignite a furious short-covering rally. The S&P 500 closed up 9.5% and the Nasdaq Composite gained over 12%, with 99% of S&P constituents finishing green. It was the third-best single-session gain for the index since World War II.",
    assets: [
      { symbol: "SPY", name: "S&P 500", assetType: "INDEX", percentChange: 9.52, direction: "UP", openPrice: 502.30, closePrice: 550.10 },
      { symbol: "NQ", name: "Nasdaq 100", assetType: "INDEX", percentChange: 12.16, direction: "UP", openPrice: 16850.0, closePrice: 18899.36 },
      { symbol: "IWM", name: "Russell 2000", assetType: "INDEX", percentChange: 8.66, direction: "UP", openPrice: 178.50, closePrice: 193.96 },
      { symbol: "GC", name: "Gold", assetType: "COMMODITY", percentChange: -2.73, direction: "DOWN", openPrice: 3098.0, closePrice: 3013.43 },
      { symbol: "BTC", name: "Bitcoin", assetType: "CRYPTO", percentChange: 6.86, direction: "UP", openPrice: 76800, closePrice: 82069 },
    ],
  },
  {
    id: "china-counter-tariffs-april-2025",
    title: "China Retaliates with 125% Counter-Tariffs",
    date: "2025-04-11",
    category: "TARIFF",
    higherIsBetter: false,
    summary:
      "Beijing matched Washington step for step, raising duties on US imports to 125% and signaling a prolonged trade conflict.",
    explanation:
      "China's State Council Tariff Commission raised duties on US imports to 125% from 84%, in retaliation for the prior round of US tariffs. Beijing also hinted at non-tariff measures, including potential restrictions on rare-earth exports critical to US tech and defense supply chains. Treasury Secretary Bessent characterized China as 'being intransigent,' suggesting near-term de-escalation was unlikely. Markets sold off as the standoff confirmed tariffs weren't a brief negotiating tactic, and gold rallied on safe-haven demand.",
    assets: [
      { symbol: "SPY", name: "S&P 500", assetType: "INDEX", percentChange: -2.36, direction: "DOWN", openPrice: 539.45, closePrice: 526.72 },
      { symbol: "NQ", name: "Nasdaq 100", assetType: "INDEX", percentChange: -3.12, direction: "DOWN", openPrice: 18450.0, closePrice: 17874.36 },
      { symbol: "GC", name: "Gold", assetType: "COMMODITY", percentChange: 1.65, direction: "UP", openPrice: 3210.0, closePrice: 3262.97 },
      { symbol: "DXY", name: "US Dollar Index", assetType: "FOREX", percentChange: -0.82, direction: "DOWN", openPrice: 100.05, closePrice: 99.23 },
      { symbol: "BTC", name: "Bitcoin", assetType: "CRYPTO", percentChange: -1.74, direction: "DOWN", openPrice: 82500, closePrice: 81065 },
    ],
  },
  {
    id: "cpi-january-2025-hot",
    title: "January CPI Surprises Hot at 3.0% YoY",
    date: "2025-02-12",
    category: "INFLATION",
    higherIsBetter: false,
    expectedValue: "2.9%",
    actualValue: "3.0%",
    summary:
      "Headline inflation reaccelerated for the fourth straight month, derailing the Fed's near-term rate-cut narrative.",
    explanation:
      "January 2025 CPI printed at 3.0% YoY versus 2.9% consensus, with core CPI at 3.3% versus 3.1% expected. The headline marked a fourth consecutive monthly reacceleration, with sticky services components — transportation and shelter — overwhelming continued goods disinflation. Treasuries sold off across the curve, with the 10Y yield climbing roughly 10bps as Fed funds futures repriced from three cuts in 2025 to closer to one. Gold drifted lower as real yields jumped, breaking its typical inflation-hedge correlation.",
    assets: [
      { symbol: "SPY", name: "S&P 500", assetType: "INDEX", percentChange: -1.07, direction: "DOWN", openPrice: 605.3, closePrice: 598.83 },
      { symbol: "TLT", name: "20+ Yr Treasury ETF", assetType: "STOCK", percentChange: -1.42, direction: "DOWN", openPrice: 88.21, closePrice: 86.96 },
      { symbol: "GC", name: "Gold", assetType: "COMMODITY", percentChange: -0.42, direction: "DOWN", openPrice: 2902.4, closePrice: 2890.2 },
      { symbol: "NQ", name: "Nasdaq 100", assetType: "INDEX", percentChange: -1.31, direction: "DOWN", openPrice: 21786.5, closePrice: 21501.0 },
    ],
  },
  {
    id: "cpi-april-2025-cool",
    title: "April CPI Surprises Cool at 2.3% YoY",
    date: "2025-05-13",
    category: "INFLATION",
    higherIsBetter: false,
    expectedValue: "2.4%",
    actualValue: "2.3%",
    summary:
      "Headline inflation cooled below consensus to a four-year low, giving the Fed cover to consider easing later in the year.",
    explanation:
      "April CPI printed at 2.3% YoY versus 2.4% consensus, the slowest annual pace in over four years, with core CPI at 2.8% YoY in line with expectations. Energy prices fell modestly while shelter inflation continued to moderate — the long-awaited normalization in the largest CPI weight. Markets read the print as confirmation that tariff pass-through hadn't yet bled into the official data. Futures repriced back to two cuts for 2025, lifting equities, bonds, and gold simultaneously.",
    assets: [
      { symbol: "SPY", name: "S&P 500", assetType: "INDEX", percentChange: 0.72, direction: "UP", openPrice: 581.45, closePrice: 585.64 },
      { symbol: "TLT", name: "20+ Yr Treasury ETF", assetType: "STOCK", percentChange: 0.84, direction: "UP", openPrice: 86.20, closePrice: 86.92 },
      { symbol: "GC", name: "Gold", assetType: "COMMODITY", percentChange: 0.51, direction: "UP", openPrice: 3245.0, closePrice: 3261.55 },
      { symbol: "NQ", name: "Nasdaq 100", assetType: "INDEX", percentChange: 1.18, direction: "UP", openPrice: 20890.0, closePrice: 21136.50 },
    ],
  },
  {
    id: "pce-december-2024-hot",
    title: "December PCE Prints Hot at 2.6% YoY",
    date: "2025-01-31",
    category: "INFLATION",
    higherIsBetter: false,
    expectedValue: "2.5%",
    actualValue: "2.6%",
    summary:
      "The Fed's preferred inflation gauge ticked up for a third straight month, complicating the path to the next rate cut.",
    explanation:
      "December headline PCE came in at 2.6% YoY versus 2.5% expected — the third consecutive monthly reacceleration after September's 2.1% trough. Core PCE matched consensus at 2.8% YoY but the trend was clearly stalling well above the Fed's 2% target. Powell had signaled a wait-and-see posture at the prior FOMC, and this print reinforced the case for an extended hold. Treasuries sold off modestly across the curve as traders pushed back the next-cut timing into Q2.",
    assets: [
      { symbol: "SPY", name: "S&P 500", assetType: "INDEX", percentChange: -0.50, direction: "DOWN", openPrice: 605.75, closePrice: 602.72 },
      { symbol: "TLT", name: "20+ Yr Treasury ETF", assetType: "STOCK", percentChange: -0.82, direction: "DOWN", openPrice: 88.40, closePrice: 87.67 },
      { symbol: "GC", name: "Gold", assetType: "COMMODITY", percentChange: -0.31, direction: "DOWN", openPrice: 2840.0, closePrice: 2831.20 },
      { symbol: "NQ", name: "Nasdaq 100", assetType: "INDEX", percentChange: -0.47, direction: "DOWN", openPrice: 21620.0, closePrice: 21518.39 },
    ],
  },
  {
    id: "fomc-march-2025-hold",
    title: "Fed Holds Rates Steady, Maintains Two-Cut 2025 Outlook",
    date: "2025-03-19",
    category: "FED",
    higherIsBetter: true,
    summary:
      "The FOMC kept rates at 4.25–4.50% and reaffirmed two cuts this year despite tariff-driven inflation risks.",
    explanation:
      "The FOMC unanimously held the federal funds rate at 4.25–4.50% for a second straight meeting. The updated SEP raised 2025 inflation forecasts and trimmed growth expectations, but the median dot plot still penciled in two 25bp cuts before year-end — more dovish than feared. Powell repeatedly characterized tariff-driven price increases as likely transitory. The committee also slowed quantitative tightening, capping monthly Treasury runoff at $5B from $25B — a quietly dovish technical adjustment that lifted risk assets broadly.",
    assets: [
      { symbol: "SPY", name: "S&P 500", assetType: "INDEX", percentChange: 1.08, direction: "UP", openPrice: 562.1, closePrice: 568.18 },
      { symbol: "BTC", name: "Bitcoin", assetType: "CRYPTO", percentChange: 4.59, direction: "UP", openPrice: 82380, closePrice: 86162 },
      { symbol: "IWM", name: "Russell 2000", assetType: "INDEX", percentChange: 1.62, direction: "UP", openPrice: 202.45, closePrice: 205.73 },
      { symbol: "GC", name: "Gold", assetType: "COMMODITY", percentChange: 0.36, direction: "UP", openPrice: 3030.4, closePrice: 3041.30 },
    ],
  },
  {
    id: "fomc-may-2025-pause",
    title: "Fed Holds, Powell Signals Extended Pause",
    date: "2025-05-07",
    category: "FED",
    higherIsBetter: false,
    summary:
      "The FOMC held rates and Powell pushed back firmly on rate-cut expectations, citing tariff-driven uncertainty around inflation.",
    explanation:
      "The FOMC held the federal funds rate at 4.25–4.50% for a third straight meeting. Powell's press conference was unmistakably hawkish: he repeatedly emphasized risks were 'tilted to higher inflation' from tariff pass-through, and that the committee was 'in no hurry' to act. The phrase 'wait and see' appeared multiple times in the prepared remarks. Markets had positioned for a softer tone given recent cool data, so the hawkish surprise drove a modest selloff in risk assets and a bid in the dollar.",
    assets: [
      { symbol: "SPY", name: "S&P 500", assetType: "INDEX", percentChange: -0.77, direction: "DOWN", openPrice: 565.3, closePrice: 560.95 },
      { symbol: "BTC", name: "Bitcoin", assetType: "CRYPTO", percentChange: -1.42, direction: "DOWN", openPrice: 96500, closePrice: 95130 },
      { symbol: "IWM", name: "Russell 2000", assetType: "INDEX", percentChange: -1.85, direction: "DOWN", openPrice: 199.0, closePrice: 195.32 },
      { symbol: "DXY", name: "US Dollar Index", assetType: "FOREX", percentChange: 0.62, direction: "UP", openPrice: 99.40, closePrice: 100.02 },
    ],
  },
  {
    id: "israel-iran-strike-june-2025",
    title: "Israel Strikes Iranian Nuclear Sites, Oil Spikes 7%",
    date: "2025-06-13",
    category: "GEOPOLITICAL",
    higherIsBetter: false,
    summary:
      "A coordinated Israeli air assault on Iran's nuclear and missile facilities sent oil to a five-month high and triggered a global risk-off move.",
    explanation:
      "Israel conducted overnight strikes on Iranian nuclear enrichment sites at Natanz and Fordow as well as ballistic-missile production facilities, prompting Iran to launch retaliatory drones. WTI crude jumped over 7% to its highest level since January as traders priced in disruption risk to the roughly 18 million barrels per day of Strait of Hormuz transit. Equities sold off worldwide, gold rallied to a record, and the dollar caught a haven bid against most G10 currencies. Defense and energy stocks were the only sectors to close green.",
    assets: [
      { symbol: "CL", name: "WTI Crude", assetType: "COMMODITY", percentChange: 7.26, direction: "UP", openPrice: 68.50, closePrice: 73.47 },
      { symbol: "GC", name: "Gold", assetType: "COMMODITY", percentChange: 1.30, direction: "UP", openPrice: 3382.0, closePrice: 3425.97 },
      { symbol: "SPY", name: "S&P 500", assetType: "INDEX", percentChange: -1.13, direction: "DOWN", openPrice: 600.85, closePrice: 594.06 },
      { symbol: "DXY", name: "US Dollar Index", assetType: "FOREX", percentChange: 0.27, direction: "UP", openPrice: 98.10, closePrice: 98.36 },
      { symbol: "BTC", name: "Bitcoin", assetType: "CRYPTO", percentChange: -2.85, direction: "DOWN", openPrice: 108200, closePrice: 105119 },
    ],
  },
  {
    id: "scotus-tariffs-feb-2026",
    title: "Supreme Court Strikes Down IEEPA Tariffs in 6-3 Ruling",
    date: "2026-02-25",
    category: "GEOPOLITICAL",
    higherIsBetter: true,
    summary:
      "In a sweeping rebuke, SCOTUS ruled the IEEPA does not authorize blanket tariffs, sending equities to fresh all-time highs.",
    explanation:
      "The Supreme Court ruled 6-3 in Trump v. V.O.S. Selections that the International Emergency Economic Powers Act does not delegate tariff-setting authority to the executive branch, citing the major questions doctrine. The decision strikes down virtually all reciprocal and trafficking-related tariffs imposed since early 2025, though Section 232 and 301 tariffs remain in place. Treasury announced it would honor refund procedures for duties already collected. Equities ripped on the news as the market priced out years of tariff drag, with multinationals and import-heavy retailers leading the rally.",
    assets: [
      { symbol: "SPY", name: "S&P 500", assetType: "INDEX", percentChange: 3.85, direction: "UP", openPrice: 642.10, closePrice: 666.82 },
      { symbol: "NQ", name: "Nasdaq 100", assetType: "INDEX", percentChange: 4.62, direction: "UP", openPrice: 22340.0, closePrice: 23372.11 },
      { symbol: "IWM", name: "Russell 2000", assetType: "INDEX", percentChange: 5.21, direction: "UP", openPrice: 224.80, closePrice: 236.51 },
      { symbol: "DXY", name: "US Dollar Index", assetType: "FOREX", percentChange: 1.20, direction: "UP", openPrice: 96.40, closePrice: 97.56 },
      { symbol: "GC", name: "Gold", assetType: "COMMODITY", percentChange: -2.10, direction: "DOWN", openPrice: 3550.0, closePrice: 3475.45 },
      { symbol: "BTC", name: "Bitcoin", assetType: "CRYPTO", percentChange: 2.95, direction: "UP", openPrice: 124800, closePrice: 128480 },
    ],
  },
  {
    id: "nvda-q1-fy26-beat",
    title: "NVIDIA Q1 Crushes Estimates as Data Center Hits $39B",
    date: "2025-05-28",
    category: "EARNINGS",
    higherIsBetter: true,
    expectedValue: "$43.30B",
    actualValue: "$44.06B",
    summary:
      "NVIDIA's data-center segment posted record quarterly revenue, with Q2 guidance topping the Street despite an $8B H20 export-restriction headwind.",
    explanation:
      "NVIDIA reported Q1 FY26 revenue of $44.06B versus $43.30B consensus — a 69% YoY increase, with data-center revenue at $39.1B (up 73% YoY). The beat came despite a disclosed $4.5B charge for H20 inventory tied to new China export restrictions. Q2 guidance of $45.0B beat consensus by ~$400M and embeds an estimated $8B revenue headwind from H20 — implying underlying demand even stronger than headline. CFO Colette Kress noted Blackwell production was 'in full ramp,' and shares jumped 5% in after-hours trading.",
    assets: [
      { symbol: "NVDA", name: "NVIDIA", assetType: "STOCK", percentChange: 5.28, direction: "UP", openPrice: 134.50, closePrice: 141.60 },
      { symbol: "SOXX", name: "Semiconductor ETF", assetType: "STOCK", percentChange: 2.47, direction: "UP", openPrice: 215.30, closePrice: 220.62 },
      { symbol: "QQQ", name: "Nasdaq 100 ETF", assetType: "INDEX", percentChange: 1.05, direction: "UP", openPrice: 514.20, closePrice: 519.60 },
      { symbol: "SPY", name: "S&P 500", assetType: "INDEX", percentChange: 0.40, direction: "UP", openPrice: 587.80, closePrice: 590.15 },
    ],
  },
  {
    id: "tsla-q1-2025-miss",
    title: "Tesla Q1 Misses Big as Auto Margins Collapse",
    date: "2025-04-22",
    category: "EARNINGS",
    higherIsBetter: true,
    expectedValue: "$0.39 EPS",
    actualValue: "$0.27 EPS",
    summary:
      "Revenue and earnings missed across the board as deliveries slumped and auto gross margin fell to a five-year low.",
    explanation:
      "Tesla reported Q1 EPS of $0.27 versus $0.39 expected, on revenue of $19.3B versus $21.1B expected. Auto gross margin excluding regulatory credits collapsed to 12.5%, the lowest since 2020, as price cuts and lower volumes pressured unit economics. Deliveries had already been disclosed at 336K versus 390K expected, but the margin compression was the bigger surprise. Musk pledged to refocus on Tesla after months at DOGE and reiterated the lower-cost vehicle remained on track for first-half production.",
    assets: [
      { symbol: "TSLA", name: "Tesla", assetType: "STOCK", percentChange: -4.85, direction: "DOWN", openPrice: 237.20, closePrice: 225.70 },
      { symbol: "QQQ", name: "Nasdaq 100 ETF", assetType: "INDEX", percentChange: -1.95, direction: "DOWN", openPrice: 462.00, closePrice: 452.99 },
      { symbol: "SPY", name: "S&P 500", assetType: "INDEX", percentChange: -1.28, direction: "DOWN", openPrice: 525.40, closePrice: 518.67 },
      { symbol: "IWM", name: "Russell 2000", assetType: "INDEX", percentChange: -1.62, direction: "DOWN", openPrice: 184.50, closePrice: 181.51 },
    ],
  },
];
