/**
 * Continuous volatility features: VIX level, trailing VIX percentile, equity RV20.
 * Pure functions over already-selected {@link MarketContextObservation} rows.
 */

import {
  EQUITY_RV_ANNUALIZATION_FACTOR,
  EQUITY_RV_SESSIONS,
  FEATURE_DEFINITIONS,
  REQUIRED_UNITS,
  SERIES_KEYS,
  VIX_PERCENTILE_LOOKBACK,
} from "@/services/context/featureDefinitions";
import { featureResult } from "@/services/context/featureResult";
import { selectEligibleMarketObservations } from "@/services/context/pointInTime";
import type {
  FeatureComputeRequest,
  FeatureInputRef,
  FeatureResult,
  MarketContextObservation,
} from "@/types/context";

function ref(
  obs: MarketContextObservation,
  role: FeatureInputRef["role"],
): FeatureInputRef {
  return {
    observationId: obs.id,
    seriesKey: obs.seriesKey,
    observationDate: obs.observationDate,
    role,
  };
}

function rejectUnitMismatch(
  request: FeatureComputeRequest,
  featureKey: keyof typeof FEATURE_DEFINITIONS,
  seriesKey: string,
  observations: readonly MarketContextObservation[],
): FeatureResult | null {
  const required = REQUIRED_UNITS[seriesKey as keyof typeof REQUIRED_UNITS];
  const def = FEATURE_DEFINITIONS[featureKey];
  const wrong = observations.find(
    (obs) => obs.seriesKey === seriesKey && obs.unit !== required,
  );
  if (!wrong) return null;
  return featureResult({
    featureKey: def.featureKey,
    definitionVersion: def.definitionVersion,
    unit: def.unit,
    request,
    value: null,
    status: "invalid_input",
    reasonCode: "invalid_unit",
    inputRefs: [ref(wrong, "level")],
    detail: `expected unit ${required} for ${seriesKey}, got ${wrong.unit}`,
  });
}

/**
 * Latest eligible VIX close strictly before cutoff.
 */
export function computeVixLevel(request: FeatureComputeRequest): FeatureResult {
  const def = FEATURE_DEFINITIONS.vix_level;
  const unitError = rejectUnitMismatch(
    request,
    "vix_level",
    SERIES_KEYS.VIXCLS,
    request.observations,
  );
  if (unitError) return unitError;

  if (request.observations.length === 0) {
    return featureResult({
      featureKey: def.featureKey,
      definitionVersion: def.definitionVersion,
      unit: def.unit,
      request,
      value: null,
      status: "unavailable",
      reasonCode: "empty_input",
    });
  }

  const eligible = selectEligibleMarketObservations(
    request.observations,
    SERIES_KEYS.VIXCLS,
    request.cutoff,
  );

  if (eligible.length === 0) {
    return featureResult({
      featureKey: def.featureKey,
      definitionVersion: def.definitionVersion,
      unit: def.unit,
      request,
      value: null,
      status: "unavailable",
      reasonCode: "no_eligible_observation",
    });
  }

  const latest = eligible[eligible.length - 1]!;
  return featureResult({
    featureKey: def.featureKey,
    definitionVersion: def.definitionVersion,
    unit: def.unit,
    request,
    value: latest.value,
    status: "ok",
    reasonCode: "ok",
    inputRefs: [ref(latest, "level")],
  });
}

/**
 * Empirical percentile of the latest VIX among the prior N eligible prints,
 * excluding the latest. Tie rule: count prior values <= latest (inclusive).
 * Formula: 100 * count / N. Requires exactly N prior eligible observations.
 */
export function computeVixTrailingPercentile(
  request: FeatureComputeRequest,
  lookback: number = VIX_PERCENTILE_LOOKBACK,
): FeatureResult {
  const def = FEATURE_DEFINITIONS.vix_pct_trailing;
  const unitError = rejectUnitMismatch(
    request,
    "vix_pct_trailing",
    SERIES_KEYS.VIXCLS,
    request.observations,
  );
  if (unitError) return unitError;

  if (lookback <= 0) {
    return featureResult({
      featureKey: def.featureKey,
      definitionVersion: def.definitionVersion,
      unit: def.unit,
      request,
      value: null,
      status: "invalid_input",
      reasonCode: "incomplete_window",
      detail: "lookback must be positive",
    });
  }

  const eligible = selectEligibleMarketObservations(
    request.observations,
    SERIES_KEYS.VIXCLS,
    request.cutoff,
  );

  if (eligible.length < lookback + 1) {
    return featureResult({
      featureKey: def.featureKey,
      definitionVersion: def.definitionVersion,
      unit: def.unit,
      request,
      value: null,
      status: "unavailable",
      reasonCode: "insufficient_history",
      detail: `need ${lookback + 1} eligible VIX prints, have ${eligible.length}`,
    });
  }

  const window = eligible.slice(-(lookback + 1));
  const latest = window[window.length - 1]!;
  const prior = window.slice(0, lookback);
  const latestValue = latest.value as number;
  let count = 0;
  for (const obs of prior) {
    if ((obs.value as number) <= latestValue) count += 1;
  }
  const percentile = (100 * count) / lookback;

  return featureResult({
    featureKey: def.featureKey,
    definitionVersion: def.definitionVersion,
    unit: def.unit,
    request,
    value: percentile,
    status: "ok",
    reasonCode: "ok",
    inputRefs: [
      ref(latest, "level"),
      ...prior.map((obs) => ref(obs, "window_member")),
    ],
  });
}

/**
 * Build the series calendar from all non-conflict observations for the series
 * (including those not yet eligible), then require a consecutive trailing window
 * on that calendar where every session is eligible at cutoff.
 */
function consecutiveEligibleCloses(
  observations: readonly MarketContextObservation[],
  seriesKey: string,
  cutoff: Date,
  closeCount: number,
):
  | { ok: true; window: MarketContextObservation[] }
  | { ok: false; reason: FeatureResult["reasonCode"]; detail?: string } {
  const seriesObs = observations
    .filter((obs) => obs.seriesKey === seriesKey && obs.quality !== "conflict")
    .slice()
    .sort((a, b) => {
      const byDate = a.observationDate.localeCompare(b.observationDate);
      if (byDate !== 0) return byDate;
      return a.id.localeCompare(b.id);
    });

  if (seriesObs.length === 0) {
    return { ok: false, reason: "empty_input" };
  }

  const byDate = new Map<string, MarketContextObservation>();
  for (const obs of seriesObs) {
    // Last id wins on duplicate dates — adapters should not emit duplicates.
    byDate.set(obs.observationDate, obs);
  }
  const calendar = [...byDate.keys()].sort();

  const eligible = selectEligibleMarketObservations(
    observations,
    seriesKey,
    cutoff,
  );
  if (eligible.length === 0) {
    return { ok: false, reason: "no_eligible_observation" };
  }

  const endDate = eligible[eligible.length - 1]!.observationDate;
  const endIdx = calendar.indexOf(endDate);
  if (endIdx < closeCount - 1) {
    return {
      ok: false,
      reason: "insufficient_history",
      detail: `need ${closeCount} consecutive sessions ending ${endDate}`,
    };
  }

  const windowDates = calendar.slice(endIdx - closeCount + 1, endIdx + 1);
  const window: MarketContextObservation[] = [];
  for (const date of windowDates) {
    const obs = byDate.get(date);
    if (!obs || obs.value === null || !Number.isFinite(obs.value)) {
      return {
        ok: false,
        reason: "non_consecutive_sessions",
        detail: `gap or missing value on ${date}`,
      };
    }
    if (
      !(obs.availableAt instanceof Date) ||
      obs.availableAt.getTime() >= cutoff.getTime()
    ) {
      return {
        ok: false,
        reason: "incomplete_window",
        detail: `session ${date} not available before cutoff`,
      };
    }
    window.push(obs);
  }

  return { ok: true, window };
}

/**
 * Annualized realized volatility over {@link EQUITY_RV_SESSIONS} log returns.
 * Sample SD uses ddof=1. Zero variance yields 0 only when measured from a
 * complete window of flat prices (a real measurement), not from missing data.
 */
export function computeEquityRealizedVol20(
  request: FeatureComputeRequest,
  seriesKey: string = SERIES_KEYS.SPY,
  sessions: number = EQUITY_RV_SESSIONS,
): FeatureResult {
  const def = FEATURE_DEFINITIONS.equity_rv_20;
  const requiredUnit =
    seriesKey === SERIES_KEYS.SPY
      ? REQUIRED_UNITS[SERIES_KEYS.SPY]
      : "price";

  const wrong = request.observations.find(
    (obs) => obs.seriesKey === seriesKey && obs.unit !== requiredUnit,
  );
  if (wrong) {
    return featureResult({
      featureKey: def.featureKey,
      definitionVersion: def.definitionVersion,
      unit: def.unit,
      request,
      value: null,
      status: "invalid_input",
      reasonCode: "invalid_unit",
      inputRefs: [ref(wrong, "level")],
      detail: `expected unit ${requiredUnit} for ${seriesKey}, got ${wrong.unit}`,
    });
  }

  if (sessions < 1) {
    return featureResult({
      featureKey: def.featureKey,
      definitionVersion: def.definitionVersion,
      unit: def.unit,
      request,
      value: null,
      status: "invalid_input",
      reasonCode: "incomplete_window",
      detail: "sessions must be >= 1",
    });
  }

  const closeCount = sessions + 1;
  const selected = consecutiveEligibleCloses(
    request.observations,
    seriesKey,
    request.cutoff,
    closeCount,
  );

  if (!selected.ok) {
    return featureResult({
      featureKey: def.featureKey,
      definitionVersion: def.definitionVersion,
      unit: def.unit,
      request,
      value: null,
      status: "unavailable",
      reasonCode: selected.reason,
      detail: selected.detail,
    });
  }

  const closes = selected.window.map((obs) => obs.value as number);
  if (closes.some((price) => price <= 0)) {
    return featureResult({
      featureKey: def.featureKey,
      definitionVersion: def.definitionVersion,
      unit: def.unit,
      request,
      value: null,
      status: "invalid_input",
      reasonCode: "non_finite_value",
      detail: "log returns require strictly positive prices",
      inputRefs: selected.window.map((obs) => ref(obs, "window_member")),
    });
  }

  const logReturns: number[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    logReturns.push(Math.log(closes[i]! / closes[i - 1]!));
  }

  const n = logReturns.length;
  const mean = logReturns.reduce((sum, r) => sum + r, 0) / n;
  let sumSq = 0;
  for (const r of logReturns) {
    const d = r - mean;
    sumSq += d * d;
  }
  const sampleVariance = sumSq / (n - 1);
  const annualizedPct =
    Math.sqrt(sampleVariance) * EQUITY_RV_ANNUALIZATION_FACTOR * 100;

  return featureResult({
    featureKey: def.featureKey,
    definitionVersion: def.definitionVersion,
    unit: def.unit,
    request,
    value: annualizedPct,
    status: "ok",
    reasonCode: "ok",
    inputRefs: selected.window.map((obs) => ref(obs, "window_member")),
  });
}
