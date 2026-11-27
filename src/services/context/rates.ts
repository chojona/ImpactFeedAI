/**
 * Continuous rates features: 2s10s Treasury spread in basis points.
 */

import {
  FEATURE_DEFINITIONS,
  REQUIRED_UNITS,
  SERIES_KEYS,
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

/**
 * 100 * (DGS10 − DGS2) on the latest shared eligible observation date.
 */
export function computeSpread2s10s(
  request: FeatureComputeRequest,
): FeatureResult {
  const def = FEATURE_DEFINITIONS.spread_2s10s;

  const wrong2 = request.observations.find(
    (obs) =>
      obs.seriesKey === SERIES_KEYS.DGS2 &&
      obs.unit !== REQUIRED_UNITS[SERIES_KEYS.DGS2],
  );
  const wrong10 = request.observations.find(
    (obs) =>
      obs.seriesKey === SERIES_KEYS.DGS10 &&
      obs.unit !== REQUIRED_UNITS[SERIES_KEYS.DGS10],
  );
  const wrong = wrong2 ?? wrong10;
  if (wrong) {
    return featureResult({
      featureKey: def.featureKey,
      definitionVersion: def.definitionVersion,
      unit: def.unit,
      request,
      value: null,
      status: "invalid_input",
      reasonCode: wrong2 && wrong10 && wrong2.unit !== wrong10.unit
        ? "mismatched_units"
        : "invalid_unit",
      inputRefs: [ref(wrong, "level")],
      detail: `yield inputs must use unit pct_level`,
    });
  }

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

  const dgs2 = selectEligibleMarketObservations(
    request.observations,
    SERIES_KEYS.DGS2,
    request.cutoff,
  );
  const dgs10 = selectEligibleMarketObservations(
    request.observations,
    SERIES_KEYS.DGS10,
    request.cutoff,
  );

  if (dgs2.length === 0 || dgs10.length === 0) {
    return featureResult({
      featureKey: def.featureKey,
      definitionVersion: def.definitionVersion,
      unit: def.unit,
      request,
      value: null,
      status: "unavailable",
      reasonCode: "no_eligible_observation",
      detail: `eligible DGS2=${dgs2.length}, DGS10=${dgs10.length}`,
    });
  }

  const dgs2ByDate = new Map(dgs2.map((obs) => [obs.observationDate, obs]));
  const dgs10ByDate = new Map(dgs10.map((obs) => [obs.observationDate, obs]));

  const sharedDates = [...dgs10ByDate.keys()]
    .filter((date) => dgs2ByDate.has(date))
    .sort();

  if (sharedDates.length === 0) {
    return featureResult({
      featureKey: def.featureKey,
      definitionVersion: def.definitionVersion,
      unit: def.unit,
      request,
      value: null,
      status: "unavailable",
      reasonCode: "date_misaligned",
      detail: "no common eligible observationDate for DGS2 and DGS10",
    });
  }

  const date = sharedDates[sharedDates.length - 1]!;
  const short = dgs2ByDate.get(date)!;
  const long = dgs10ByDate.get(date)!;
  const spreadBp = 100 * ((long.value as number) - (short.value as number));

  return featureResult({
    featureKey: def.featureKey,
    definitionVersion: def.definitionVersion,
    unit: def.unit,
    request,
    value: spreadBp,
    status: "ok",
    reasonCode: "ok",
    inputRefs: [ref(short, "denominator"), ref(long, "numerator")],
  });
}
