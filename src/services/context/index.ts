/**
 * Phase 1 market-context feature contracts (pure calculation layer).
 *
 * Agent 03 owns macro PIT/vintage selection. Agent 05 owns market-price
 * adapters that emit {@link MarketContextObservation}. This package computes
 * continuous features from already-selected observations.
 */

export {
  EQUITY_RV_ANNUALIZATION_FACTOR,
  EQUITY_RV_SESSIONS,
  FEATURE_DEFINITIONS,
  REGIME_FEATURE_DEFINITION_VERSION,
  REQUIRED_UNITS,
  SERIES_KEYS,
  VIX_PERCENTILE_LOOKBACK,
  featureDefinition,
  isKnowledgeMode,
} from "@/services/context/featureDefinitions";
export type {
  FeatureDefinition,
  MarketSeriesKey,
  RegimeFeatureKey,
} from "@/services/context/featureDefinitions";

export {
  indexSeriesByObservationDate,
  isAvailableBeforeCutoff,
  isMarketObservationEligible,
  isValidObservationDate,
  marketObservationIneligibilityReasons,
  selectEligibleMarketObservations,
  seriesHasDateConflicts,
} from "@/services/context/pointInTime";
export type {
  DateIndexConflict,
  SeriesDateIndex,
} from "@/services/context/pointInTime";

export { computeSpread2s10s } from "@/services/context/rates";

export {
  computeEquityRealizedVol20,
  computeVixLevel,
  computeVixTrailingPercentile,
} from "@/services/context/volatility";
export type { EquityRvOptions } from "@/services/context/volatility";
