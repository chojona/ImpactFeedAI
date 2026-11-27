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
import {
  indexSeriesByObservationDate,
  isValidObservationDate,
  selectEligibleMarketObservations,
} from "@/services/context/pointInTime";
import type {
  FeatureComputeRequest,
  FeatureInputRef,
  FeatureReasonCode,
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

function conflictResult(
  request: FeatureComputeRequest,
  featureKey: keyof typeof FEATURE_DEFINITIONS,
  seriesKey: string,
): FeatureResult | null {
  const { conflicts } = indexSeriesByObservationDate(
    request.observations,
    seriesKey,
  );
  if (conflicts.length === 0) return null;
  const def = FEATURE_DEFINITIONS[featureKey];
  return featureResult({
    featureKey: def.featureKey,
    definitionVersion: def.definitionVersion,
    unit: def.unit,
    request,
    value: null,
    status: "unavailable",
    reasonCode: "conflict_quarantined",
    detail: `duplicate observationDate quarantined for ${seriesKey}: ${conflicts
      .map((c) => c.observationDate)
      .join(",")}`,
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

  const conflict = conflictResult(request, "vix_level", SERIES_KEYS.VIXCLS);
  if (conflict) return conflict;

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
    request.knowledgeMode,
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

  const conflict = conflictResult(
    request,
    "vix_pct_trailing",
    SERIES_KEYS.VIXCLS,
  );
  if (conflict) return conflict;

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
    request.knowledgeMode,
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

function normalizeSessionCalendar(
  calendar: readonly string[] | undefined,
):
  | { ok: true; days: readonly string[] }
  | { ok: false; reason: FeatureReasonCode; detail: string } {
  if (!calendar || calendar.length === 0) {
    return {
      ok: false,
      reason: "missing_session_calendar",
      detail: "equity RV requires an independently validated sessionCalendar",
    };
  }
  for (const day of calendar) {
    if (!isValidObservationDate(day)) {
      return {
        ok: false,
        reason: "impossible_observation_date",
        detail: `invalid session calendar date ${day}`,
      };
    }
  }
  const sorted = [...calendar].sort();
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] === sorted[i - 1]) {
      return {
        ok: false,
        reason: "invalid_session_calendar",
        detail: `duplicate session calendar date ${sorted[i]}`,
      };
    }
  }
  // Reject unsorted input that would silently reorder expectations.
  for (let i = 0; i < calendar.length; i += 1) {
    if (calendar[i] !== sorted[i]) {
      return {
        ok: false,
        reason: "invalid_session_calendar",
        detail: "sessionCalendar must be unique and ascending",
      };
    }
  }
  return { ok: true, days: calendar };
}

/**
 * Require trailing closes on an independent session calendar.
 * Missing source rows do not compress the window.
 */
function consecutiveEligibleClosesOnCalendar(
  observations: readonly MarketContextObservation[],
  seriesKey: string,
  request: FeatureComputeRequest,
  closeCount: number,
  sessionCalendar: readonly string[],
):
  | { ok: true; window: MarketContextObservation[] }
  | { ok: false; reason: FeatureReasonCode; detail?: string } {
  const { byDate, conflicts } = indexSeriesByObservationDate(
    observations,
    seriesKey,
  );
  if (conflicts.length > 0) {
    return {
      ok: false,
      reason: "conflict_quarantined",
      detail: `duplicate observationDate quarantined: ${conflicts
        .map((c) => c.observationDate)
        .join(",")}`,
    };
  }

  const eligible = selectEligibleMarketObservations(
    observations,
    seriesKey,
    request.cutoff,
    request.knowledgeMode,
  );
  if (eligible.length === 0) {
    return { ok: false, reason: "no_eligible_observation" };
  }

  const endDate = eligible[eligible.length - 1]!.observationDate;
  const endIdx = sessionCalendar.indexOf(endDate);
  if (endIdx < 0) {
    return {
      ok: false,
      reason: "non_consecutive_sessions",
      detail: `latest eligible date ${endDate} is not on sessionCalendar`,
    };
  }
  if (endIdx < closeCount - 1) {
    return {
      ok: false,
      reason: "insufficient_history",
      detail: `need ${closeCount} consecutive calendar sessions ending ${endDate}`,
    };
  }

  const windowDates = sessionCalendar.slice(endIdx - closeCount + 1, endIdx + 1);
  const window: MarketContextObservation[] = [];
  for (const date of windowDates) {
    const obs = byDate.get(date);
    if (!obs) {
      return {
        ok: false,
        reason: "incomplete_window",
        detail: `missing source row for session ${date}; window not compressed`,
      };
    }
    if (
      !selectEligibleMarketObservations(
        [obs],
        seriesKey,
        request.cutoff,
        request.knowledgeMode,
      ).length
    ) {
      return {
        ok: false,
        reason: "incomplete_window",
        detail: `session ${date} not eligible before cutoff`,
      };
    }
    window.push(obs);
  }

  return { ok: true, window };
}

export interface EquityRvOptions {
  readonly seriesKey?: string;
  readonly sessions?: number;
}

/**
 * Annualized realized volatility over {@link EQUITY_RV_SESSIONS} log returns.
 * Sample SD uses ddof=1 and requires at least two returns.
 * `request.sessionCalendar` must be an independently validated ascending unique
 * session-date list; missing source rows fail instead of compressing.
 */
export function computeEquityRealizedVol20(
  request: FeatureComputeRequest,
  options: EquityRvOptions = {},
): FeatureResult {
  const def = FEATURE_DEFINITIONS.equity_rv_20;
  const seriesKey = options.seriesKey ?? SERIES_KEYS.SPY;
  const sessions = options.sessions ?? EQUITY_RV_SESSIONS;
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

  // ddof=1 sample SD needs >= 2 returns ⇒ sessions >= 2.
  if (sessions < 2) {
    return featureResult({
      featureKey: def.featureKey,
      definitionVersion: def.definitionVersion,
      unit: def.unit,
      request,
      value: null,
      status: "invalid_input",
      reasonCode: "insufficient_returns",
      detail: "equity RV requires at least two log returns (sessions >= 2)",
    });
  }

  const calendar = normalizeSessionCalendar(request.sessionCalendar);
  if (!calendar.ok) {
    return featureResult({
      featureKey: def.featureKey,
      definitionVersion: def.definitionVersion,
      unit: def.unit,
      request,
      value: null,
      status: "invalid_input",
      reasonCode: calendar.reason,
      detail: calendar.detail,
    });
  }

  const closeCount = sessions + 1;
  const selected = consecutiveEligibleClosesOnCalendar(
    request.observations,
    seriesKey,
    request,
    closeCount,
    calendar.days,
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

  if (logReturns.length < 2) {
    return featureResult({
      featureKey: def.featureKey,
      definitionVersion: def.definitionVersion,
      unit: def.unit,
      request,
      value: null,
      status: "invalid_input",
      reasonCode: "insufficient_returns",
      detail: "sample SD (ddof=1) requires at least two returns",
      inputRefs: selected.window.map((obs) => ref(obs, "window_member")),
    });
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
