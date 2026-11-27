/**
 * Versioned continuous feature definitions for Phase 1 Tier-A market context.
 *
 * Thresholds / windows here are operational research defaults, not predictive
 * claims. Categorical regime labels are out of scope for this module.
 *
 * Series keys are the contract Agent 05 adapters and Agent 03 FRED market
 * projections should emit.
 */

import type { ContextUnit } from "@/types/context";
import { isKnowledgeMode as isSharedKnowledgeMode } from "@/services/context/knowledgeMode";

/** Feature-math contract version for this milestone. */
export const REGIME_FEATURE_DEFINITION_VERSION = "phase-1-regime-features-3";

export const SERIES_KEYS = {
  VIXCLS: "market:VIXCLS:level",
  DGS2: "market:DGS2:yield_pct",
  DGS10: "market:DGS10:yield_pct",
  SPY: "market:SPY:close",
} as const;

export type MarketSeriesKey = (typeof SERIES_KEYS)[keyof typeof SERIES_KEYS];

export interface FeatureDefinition {
  readonly featureKey: string;
  readonly definitionVersion: string;
  readonly unit: ContextUnit;
  readonly description: string;
  readonly sourceSeriesKeys: readonly MarketSeriesKey[];
  readonly citations: readonly string[];
}

export const FEATURE_DEFINITIONS = {
  vix_level: {
    featureKey: "vix_level",
    definitionVersion: REGIME_FEATURE_DEFINITION_VERSION,
    unit: "index_points",
    description:
      "Latest eligible daily VIX close (FRED VIXCLS) strictly before cutoff.",
    sourceSeriesKeys: [SERIES_KEYS.VIXCLS],
    citations: ["https://fred.stlouisfed.org/series/VIXCLS"],
  },
  vix_pct_trailing: {
    featureKey: "vix_pct_trailing",
    definitionVersion: REGIME_FEATURE_DEFINITION_VERSION,
    unit: "pct_level",
    description:
      "Percentile of latest VIX among the prior 252 independently validated session-calendar prints, excluding the latest. Requires sessionCalendar completeness (no gap compression).",
    sourceSeriesKeys: [SERIES_KEYS.VIXCLS],
    citations: ["https://fred.stlouisfed.org/series/VIXCLS"],
  },
  spread_2s10s: {
    featureKey: "spread_2s10s",
    definitionVersion: REGIME_FEATURE_DEFINITION_VERSION,
    unit: "basis_points",
    description:
      "100 * (DGS10 − DGS2) on the same source observation date, in basis points.",
    sourceSeriesKeys: [SERIES_KEYS.DGS2, SERIES_KEYS.DGS10],
    citations: [
      "https://fred.stlouisfed.org/series/DGS2",
      "https://fred.stlouisfed.org/series/DGS10",
    ],
  },
  equity_rv_20: {
    featureKey: "equity_rv_20",
    definitionVersion: REGIME_FEATURE_DEFINITION_VERSION,
    unit: "pct_annualized",
    description:
      "Sample SD (ddof=1) of log daily close returns over 20 completed sessions, annualized with sqrt(252)*100. Requires 21 consecutive eligible closes.",
    sourceSeriesKeys: [SERIES_KEYS.SPY],
    citations: ["https://finance.yahoo.com/quote/SPY"],
  },
} as const satisfies Record<string, FeatureDefinition>;

export type RegimeFeatureKey = keyof typeof FEATURE_DEFINITIONS;

/** Default trailing window for VIX percentile (prior observations, excluding latest). */
export const VIX_PERCENTILE_LOOKBACK = 252;

/** Completed return sessions for equity RV20 (needs lookback + 1 closes). */
export const EQUITY_RV_SESSIONS = 20;

export const EQUITY_RV_ANNUALIZATION_FACTOR = Math.sqrt(252);

export const REQUIRED_UNITS = {
  [SERIES_KEYS.VIXCLS]: "index_points",
  [SERIES_KEYS.DGS2]: "pct_level",
  [SERIES_KEYS.DGS10]: "pct_level",
  [SERIES_KEYS.SPY]: "price",
} as const;

export function featureDefinition(
  featureKey: RegimeFeatureKey,
): FeatureDefinition {
  return FEATURE_DEFINITIONS[featureKey];
}

/** Re-export for callers that only import featureDefinitions. */
export const isKnowledgeMode = isSharedKnowledgeMode;
