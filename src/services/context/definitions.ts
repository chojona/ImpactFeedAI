/**
 * ALFRED / macro series registry for Phase 1.1.
 *
 * Feature-math definitions live in `featureDefinitions.ts` (PR #16) to avoid
 * colliding with this registry. Shared {@link KnowledgeMode} helpers live in
 * `knowledgeMode.ts`.
 */

import { isKnowledgeMode } from "@/services/context/knowledgeMode";

export { isKnowledgeMode };

/** Ingestion/selection contract version for this milestone. */
export const CONTEXT_INGESTION_VERSION = "phase-1.1-alfred-point-in-time-1";

/**
 * Conservative ALFRED date-bound policy: a trustworthy vintage/publication
 * *date* becomes available only after that America/New_York calendar day ends.
 * Exact `publishedAt` stays null. Same-day pre-release cutoffs exclude the obs.
 */
export const ALFRED_NY_EOD_AVAILABILITY_POLICY = "alfred-ny-eod-v1";

export const FRED_ALFRED_PROVIDER_ID = "fred-alfred";

export const FRED_OBSERVATIONS_ENDPOINT =
  "https://api.stlouisfed.org/fred/series/observations";

export const FRED_VINTAGE_DATES_ENDPOINT =
  "https://api.stlouisfed.org/fred/series/vintagedates";

/** Complete ALFRED real-time span for revision / first-print archives. */
export const ALFRED_FULL_REALTIME_START = "1776-07-04";
export const ALFRED_FULL_REALTIME_END = "9999-12-31";

/**
 * Market series keys shared with PR #16 feature contracts and market-price
 * adapters. ALFRED daily market series project into these after PIT filtering.
 */
export const MARKET_SERIES_KEYS = {
  VIXCLS: "market:VIXCLS:level",
  DGS2: "market:DGS2:yield_pct",
  DGS10: "market:DGS10:yield_pct",
  SPY: "market:SPY:close",
} as const;

export type MarketSeriesKey =
  (typeof MARKET_SERIES_KEYS)[keyof typeof MARKET_SERIES_KEYS];

export interface ContextSeriesDefinition {
  readonly seriesKey: string;
  readonly providerSeriesId: string;
  readonly unit: string;
  readonly frequency: "daily" | "monthly" | "quarterly";
  readonly sourceTimezone: "America/New_York" | "UTC";
  readonly definitionVersion: string;
  readonly citation: string;
}

export const CONTEXT_SERIES = {
  PAYEMS: {
    seriesKey: "macro:PAYEMS:level",
    providerSeriesId: "PAYEMS",
    unit: "thousands_level",
    frequency: "monthly",
    sourceTimezone: "America/New_York",
    definitionVersion: CONTEXT_INGESTION_VERSION,
    citation: "https://fred.stlouisfed.org/series/PAYEMS",
  },
  CPIAUCNS: {
    seriesKey: "macro:CPIAUCNS:index",
    providerSeriesId: "CPIAUCNS",
    unit: "index_points",
    frequency: "monthly",
    sourceTimezone: "America/New_York",
    definitionVersion: CONTEXT_INGESTION_VERSION,
    citation: "https://fred.stlouisfed.org/series/CPIAUCNS",
  },
  GDPC1: {
    seriesKey: "macro:GDPC1:level",
    providerSeriesId: "GDPC1",
    unit: "billions_chained_2017",
    frequency: "quarterly",
    sourceTimezone: "America/New_York",
    definitionVersion: CONTEXT_INGESTION_VERSION,
    citation: "https://fred.stlouisfed.org/series/GDPC1",
  },
  UNRATE: {
    seriesKey: "macro:UNRATE:level",
    providerSeriesId: "UNRATE",
    unit: "pct_level",
    frequency: "monthly",
    sourceTimezone: "America/New_York",
    definitionVersion: CONTEXT_INGESTION_VERSION,
    citation: "https://fred.stlouisfed.org/series/UNRATE",
  },
  VIXCLS: {
    seriesKey: MARKET_SERIES_KEYS.VIXCLS,
    providerSeriesId: "VIXCLS",
    unit: "index_points",
    frequency: "daily",
    sourceTimezone: "America/New_York",
    definitionVersion: CONTEXT_INGESTION_VERSION,
    citation: "https://fred.stlouisfed.org/series/VIXCLS",
  },
  DGS2: {
    seriesKey: MARKET_SERIES_KEYS.DGS2,
    providerSeriesId: "DGS2",
    unit: "pct_level",
    frequency: "daily",
    sourceTimezone: "America/New_York",
    definitionVersion: CONTEXT_INGESTION_VERSION,
    citation: "https://fred.stlouisfed.org/series/DGS2",
  },
  DGS10: {
    seriesKey: MARKET_SERIES_KEYS.DGS10,
    providerSeriesId: "DGS10",
    unit: "pct_level",
    frequency: "daily",
    sourceTimezone: "America/New_York",
    definitionVersion: CONTEXT_INGESTION_VERSION,
    citation: "https://fred.stlouisfed.org/series/DGS10",
  },
} as const satisfies Record<string, ContextSeriesDefinition>;

export type ContextSeriesId = keyof typeof CONTEXT_SERIES;
