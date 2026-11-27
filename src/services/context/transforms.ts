/**
 * Vintage-consistent macro transforms.
 *
 * All inputs must come from one point-in-time panel. Mixing a first-print
 * numerator with a current-vintage denominator is rejected.
 */

import {
  deriveMetric,
  type MetricTransform,
  type Observation,
} from "@/services/macro/metrics";
import type {
  ContextObservation,
  TransformInputRef,
  VintageTransformResult,
} from "@/types/context";

function assertSameSeriesPanel(
  panel: readonly (ContextObservation | null)[],
): ContextObservation[] {
  const present = panel.filter((o): o is ContextObservation => o !== null);
  if (present.length === 0) return [];
  const seriesKey = present[0].seriesKey;
  for (const obs of present) {
    if (obs.seriesKey !== seriesKey) {
      throw new TypeError("transform panel mixes seriesKey values");
    }
  }
  return present;
}

/**
 * Reject panels that combine verified/date-bound vintage rows with
 * revised_latest (current) rows — the verified MoM trap.
 */
export function assertVintageHomogeneousPanel(
  panel: readonly (ContextObservation | null)[],
): { ok: true } | { ok: false; reason: "mixed_vintage_panel" } {
  const present = panel.filter((o): o is ContextObservation => o !== null);
  const qualities = new Set(present.map((o) => o.quality));
  const hasHistorical =
    qualities.has("verified_vintage") ||
    qualities.has("conservative_date_bound");
  const hasCurrent = qualities.has("revised_latest");
  if (hasHistorical && hasCurrent) {
    return { ok: false, reason: "mixed_vintage_panel" };
  }
  return { ok: true };
}

function toMetricObservations(
  panel: readonly (ContextObservation | null)[],
): Observation[] {
  return panel.map((obs) => ({
    iso: obs?.observationPeriodStart ?? "",
    value: obs?.value ?? null,
  }));
}

function inputRefsForMom(
  panel: readonly (ContextObservation | null)[],
  index: number,
): TransformInputRef[] {
  const refs: TransformInputRef[] = [];
  const here = panel[index];
  const prior = panel[index - 1];
  if (here) {
    refs.push({
      role: "numerator",
      observationId: here.id,
      observationPeriodStart: here.observationPeriodStart,
      vintageKey: here.vintageKey,
    });
  }
  if (prior) {
    refs.push({
      role: "denominator",
      observationId: prior.id,
      observationPeriodStart: prior.observationPeriodStart,
      vintageKey: prior.vintageKey,
    });
  }
  return refs;
}

function inputRefsForYoy(
  panel: readonly (ContextObservation | null)[],
  index: number,
): TransformInputRef[] {
  const refs: TransformInputRef[] = [];
  const here = panel[index];
  const yearAgo = panel[index - 12];
  if (here) {
    refs.push({
      role: "numerator",
      observationId: here.id,
      observationPeriodStart: here.observationPeriodStart,
      vintageKey: here.vintageKey,
    });
  }
  if (yearAgo) {
    refs.push({
      role: "denominator",
      observationId: yearAgo.id,
      observationPeriodStart: yearAgo.observationPeriodStart,
      vintageKey: yearAgo.vintageKey,
    });
  }
  return refs;
}

function runTransform(
  transform: MetricTransform,
  panel: readonly (ContextObservation | null)[],
  index: number,
  unit: string,
  refs: readonly TransformInputRef[],
): VintageTransformResult {
  assertSameSeriesPanel(panel);
  const homogeneity = assertVintageHomogeneousPanel(panel);
  if (!homogeneity.ok) {
    return { status: "missing", reason: homogeneity.reason, inputs: refs };
  }
  if (
    panel[index] === null ||
    (transform === "mom_diff_thousands" && panel[index - 1] === null) ||
    (transform === "yoy_pct" && panel[index - 12] === null) ||
    (transform === "qoq_pct_annualized" && panel[index - 1] === null)
  ) {
    return {
      status: "missing",
      reason: "insufficient_vintage_panel",
      inputs: refs,
    };
  }

  const derived = deriveMetric(transform, index, toMetricObservations(panel));
  if (!derived) {
    return {
      status: "missing",
      reason: "insufficient_vintage_panel",
      inputs: refs,
    };
  }
  return {
    status: "ok",
    value: derived.value,
    prior: derived.prior,
    unit,
    inputs: refs,
  };
}

/** Month-over-month difference in thousands (payrolls). */
export function vintageConsistentMom(
  panel: readonly (ContextObservation | null)[],
  index: number,
): VintageTransformResult {
  return runTransform(
    "mom_diff_thousands",
    panel,
    index,
    "thousands_mom",
    inputRefsForMom(panel, index),
  );
}

/** Year-over-year percent change (CPI-style index). */
export function vintageConsistentYoy(
  panel: readonly (ContextObservation | null)[],
  index: number,
): VintageTransformResult {
  return runTransform(
    "yoy_pct",
    panel,
    index,
    "pct_yoy",
    inputRefsForYoy(panel, index),
  );
}

/** Quarter-over-quarter percent annualized (real GDP). */
export function vintageConsistentQoqSaar(
  panel: readonly (ContextObservation | null)[],
  index: number,
): VintageTransformResult {
  const refs = inputRefsForMom(panel, index);
  return runTransform(
    "qoq_pct_annualized",
    panel,
    index,
    "pct_saar",
    refs,
  );
}

/**
 * Helper: order panel periods ascending and locate index of `period`.
 */
export function panelIndexForPeriod(
  panel: readonly (ContextObservation | null)[],
  period: string,
): number {
  return panel.findIndex(
    (o) => o !== null && o.observationPeriodStart === period,
  );
}
