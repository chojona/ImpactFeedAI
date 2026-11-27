import type { DataProviderEntry } from "@/types/dataSources";

const TESTED_ON = "2026-11-27";

export const TREASURY_PROVIDER: DataProviderEntry = {
  id: "treasury",
  name: "U.S. Treasury rates and Fiscal Data",
  operator: "U.S. Department of the Treasury",
  category: "government_statistics",
  homepage: "https://home.treasury.gov/resource-center/data-chart-center/interest-rates",
  auth: { kind: "none", envVars: [], required: false, detail: "Public CSV/XML and the Fiscal Data REST API. No key." },
  freeTier: {
    costUsd: 0,
    limits: [],
    detail: "No published rate limit found for either host. Page Fiscal Data results with page[size].",
  },
  licensing: {
    storage: "PERMITTED",
    redistribution: "PERMITTED",
    attributionRequired: false,
    summary: "U.S. federal government work, public domain (17 U.S.C. § 105). Cite Treasury as the source.",
    termsUrl: "https://fiscaldata.treasury.gov/about-us/",
    basis: "DOCUMENTED",
  },
  implementations: [{ status: "MAIN", path: "src/services/market-context/treasury.ts" }],
  lastSuccessfulValidation: TESTED_ON,
  series: [
    {
      id: "treasury:daily_treasury_yield_curve",
      providerSeriesId: "daily_treasury_yield_curve",
      title: "Daily Treasury par yield curve rates (BC_3MONTH, BC_2YEAR, BC_10YEAR, …)",
      unit: "Percent",
      canonicalKeys: ["market:DGS3MO:yield_pct", "market:DGS2:yield_pct", "market:DGS10:yield_pct"],
      coverage: [
        {
          status: "TESTED",
          resolution: "1d",
          accessTier: "anonymous",
          start: "1990-01-02",
          end: "2026-11-25",
          testedOn: TESTED_ON,
          evidence:
            "Yearly CSV for 1990 starts 01/02/1990 (9 tenors, no 1M/2M/20Y). The 2026 CSV ends 11/25/2026. Monthly XML for 2022-03 returned 23 days.",
        },
      ],
      publication: {
        delay: "same_day_eod",
        precision: "date",
        detail:
          "Treasury posts the curve on the evening of date D, from ~3:30 PM quotes. On 2026-11-27 Treasury held 11-25 while FRED DGS10 ended 11-24.",
        availabilityRule: "availableAt = start of the next calendar day (conservative). Use the D−1 curve for an 08:30 release on D.",
        basis: "TESTED",
      },
      revisions: { kind: "unknown", detail: "Corrections are not versioned in the feed.", basis: "UNVERIFIED" },
      pointInTime: {
        status: "CONDITIONAL",
        reason: "Date precision only.",
        conditions: ["Apply the conservative next-day availability bound."],
      },
      notes: ["Primary source for 2Y/10Y. FRED DGS* is the H.15 mirror and lags one day."],
    },
    {
      id: "treasury:auctions_query",
      providerSeriesId: "v1/accounting/od/auctions_query",
      title: "Treasury securities auction results",
      unit: "Mixed (rates %, amounts USD)",
      canonicalKeys: [],
      coverage: [
        {
          status: "TESTED",
          resolution: "per_event",
          accessTier: "anonymous",
          start: "1979-10-31",
          end: "2026-10-22",
          testedOn: TESTED_ON,
          evidence:
            "Fiscal Data auctions_query reported total-count 11149. Ascending sort starts 1979-10-31, and descending sort by auction_date returned 2026-10-22 first.",
        },
      ],
      publication: {
        delay: "same_day_eod",
        precision: "unknown",
        detail:
          "closing_time_comp (e.g. 01:00 PM) is the competitive bid deadline. The results announcement time is not a field.",
        availabilityRule: null,
        basis: "TESTED",
      },
      revisions: { kind: "unknown", detail: "Not measured.", basis: "UNVERIFIED" },
      pointInTime: {
        status: "CONDITIONAL",
        reason: "Results timestamp is not published in the API.",
        conditions: [
          "Derive the announcement instant from an official auction-results press release.",
          "Filter inflation_index_security: TIPS reopenings appear with security_type 'Note'.",
        ],
      },
      notes: ["The newest returned auction (2026-10-22) is about a month old. Check whether recent results lag."],
    },
  ],
};
