import type { ExpectationKind } from "@/types/expectations";

export interface ExpectationSourceProfile {
  readonly id: string;
  readonly kind: ExpectationKind;
  readonly displayName: string;
  readonly costUsd: 0;
  readonly historicalAvailability: string;
  readonly publicationTiming: string;
  readonly usageRestrictions: string;
  readonly citationUrl: string;
  /** Whether rows may ever feed Street-surprise arithmetic. */
  readonly streetSurpriseEligible: false | "only_with_verified_asof";
}

/**
 * Inventory of free expectation sources. Cost is hard-coded 0; paid feeds are
 * out of scope for this foundation.
 */
export const FREE_EXPECTATION_SOURCES = {
  atlanta_gdpnow: {
    id: "atlanta_gdpnow",
    kind: "MODEL_NOWCAST",
    displayName: "Atlanta Fed GDPNow",
    costUsd: 0,
    historicalAvailability:
      "Tracking archives from ~2011:Q3 (deep) / live model from 2014:Q2; also FRED GDPNOW final-before-advance series.",
    publicationTiming:
      "Updated ~6–7 times per month on weekdays after source data. Spreadsheet tabs carry update dates; exact intraday clock is often date-only.",
    usageRestrictions:
      "Atlanta Fed: reproduce for personal and educational use only; not an official Fed forecast. Attribute the Bank; do not imply endorsement.",
    citationUrl: "https://www.atlantafed.org/research-and-data/data/gdpnow",
    streetSurpriseEligible: false,
  },
  cleveland_inflation_nowcast: {
    id: "cleveland_inflation_nowcast",
    kind: "MODEL_NOWCAST",
    displayName: "Cleveland Fed Inflation Nowcasting",
    costUsd: 0,
    historicalAvailability:
      "Daily CPI/core CPI/PCE/core PCE nowcasts via public chart JSON/CSV feeds; history depth follows the published chart archive.",
    publicationTiming:
      "Updated each business day. Public tables expose an Updated calendar date; treat as DATE_ONLY unless an exact instant is published.",
    usageRestrictions:
      "Public Fed Bank research product. Attribute Cleveland Fed; informational/research use. Do not invent exact clocks from the update date.",
    citationUrl:
      "https://www.clevelandfed.org/indicators-and-data/inflation-nowcasting",
    streetSurpriseEligible: false,
  },
  philadelphia_spf: {
    id: "philadelphia_spf",
    kind: "PROFESSIONAL_SURVEY",
    displayName: "Philadelphia Fed Survey of Professional Forecasters",
    costUsd: 0,
    historicalAvailability:
      "Quarterly from 1968:Q4; CPI from 1981:Q3; core CPI/PCE from 2007:Q1. Mean/median/individual files downloadable.",
    publicationTiming:
      "Survey deadlines and public release dates are published (spf-release-dates). Exact release clocks are not always stated — prefer DATE_ONLY from the published release date list.",
    usageRestrictions:
      "Philly Fed site terms limit content to informational, educational, and research use; commercial reuse of Bank name/material needs care. Free downloads ≠ redistribution license.",
    citationUrl:
      "https://www.philadelphiafed.org/surveys-and-data/real-time-data-research/survey-of-professional-forecasters",
    streetSurpriseEligible: false,
  },
  archived_public_news: {
    id: "archived_public_news",
    kind: "SURVEY_CONSENSUS",
    displayName: "Archived public financial-news consensus citations",
    costUsd: 0,
    historicalAvailability:
      "Only manually curated rows with HTTPS citations. Sparse by design; scraping Bloomberg/WSJ/Econoday is rejected.",
    publicationTiming:
      "asOf must come from the article's own published timestamp or date. Post-release recap articles are ineligible for pre-release surprise.",
    usageRestrictions:
      "Store attributed numbers for personal research only. Do not bulk-scrape. Respect each publisher's terms; prefer free/public pages with explicit timestamps.",
    citationUrl: "https://www.reuters.com/",
    streetSurpriseEligible: "only_with_verified_asof",
  },
  prospective_free_calendar: {
    id: "prospective_free_calendar",
    kind: "SURVEY_CONSENSUS",
    displayName: "Prospective free-source consensus collector",
    costUsd: 0,
    historicalAvailability:
      "Forward-only. No historical backfill. Records exist only after a permitted capture with provenance.",
    publicationTiming:
      "Capture time is recorded as fetchedAt; consensus asOf must be supplied by the source page or left MISSING.",
    usageRestrictions:
      "Only sources that permit personal research capture. No ToS-prohibited scraping. Missing forecasts stay missing.",
    citationUrl: "https://www.bls.gov/",
    streetSurpriseEligible: "only_with_verified_asof",
  },
  fred_market_implied: {
    id: "fred_market_implied",
    kind: "MARKET_IMPLIED",
    displayName: "FRED market-implied series (breakevens / related)",
    costUsd: 0,
    historicalAvailability:
      "Deep daily history for T5YIE/T10YIE and related series via free FRED API.",
    publicationTiming:
      "Daily observation dates; not an 08:30 macro print consensus.",
    usageRestrictions:
      "FRED terms apply. Series are market-implied expectations, never survey consensus.",
    citationUrl: "https://fred.stlouisfed.org/series/T5YIE",
    streetSurpriseEligible: false,
  },
} as const satisfies Record<string, ExpectationSourceProfile>;

export type FreeExpectationSourceId = keyof typeof FREE_EXPECTATION_SOURCES;
