/**
 * Official market-context adapters (read-only).
 *
 * No Prisma access and no regime math — observations only.
 */

export {
  DATE_AVAILABILITY_PRECISION,
  conservativeAvailableAtFromIsoDate,
  mdyToIsoDate,
  observationAtFromIsoDate,
  parseRawNumeric,
  qualityForParsedValue,
  treasuryDateTimeToIsoDate,
} from "@/services/market-context/availability";

export {
  CBOE_VIX_HISTORY_URL,
  fetchCboeVixHistory,
  parseCboeVixCsv,
  type CboeVixFetchOptions,
} from "@/services/market-context/cboe";

export {
  FRED_EMITTED_SERIES_KEYS,
  FRED_MARKET_SERIES_IDS,
  fetchFredMarketObservations,
  isFredMarketSeriesId,
  redactFredApiKey,
  type FredMarketFetchOptions,
  type FredMarketSeriesId,
} from "@/services/market-context/fred";

export {
  MARKET_SERIES_CATALOG,
  MARKET_SERIES_KEYS,
  PRIORITY_SERIES_CATALOG_IDS,
  marketSeriesByCatalogId,
  marketSeriesByKey,
  type CanonicalMarketSeriesKey,
  type MarketSeriesDefinition,
  type SeriesCatalogId,
} from "@/services/market-context/series";

export {
  TREASURY_YIELD_FIELDS,
  TREASURY_YIELD_XML_BASE,
  buildTreasuryYieldUrl,
  fetchTreasuryYieldCurve,
  parseTreasuryYieldXml,
  type TreasuryYieldFetchOptions,
  type TreasuryYieldField,
} from "@/services/market-context/treasury";

export type {
  AvailabilityPrecision,
  FetchLike,
  MarketContextFetchError,
  MarketContextFetchResult,
  MarketContextProvider,
  ObservationParseStatus,
  RetrievedMarketObservation,
  RetrievalMetadata,
} from "@/services/market-context/types";
