/** Macro transforms on one ALFRED snapshot or one point-in-time selection. */

import type { AlfredObservation } from "@/services/context/alfred";
import { isObservationEligible } from "@/services/context/quality";
import type { PanelObservation } from "@/services/context/revisionSelect";
import { deriveMetric } from "@/services/macro/metrics";
import type {
  ContextObservation,
  TransformInputRef,
  VintageTransformResult,
} from "@/types/context";

type TransformObservation = ContextObservation &
  Partial<Pick<AlfredObservation, "snapshotAsOf"> & Pick<PanelObservation, "selectionPolicy">>;
type TransformPanel = readonly (TransformObservation | null)[];
type HeadlineTransform = "mom_diff_thousands" | "yoy_pct" | "qoq_pct_annualized";

/** Require one validated snapshot date or one common revision-selection policy. */
export function assertVintageHomogeneousPanel(
  panel: TransformPanel,
): { ok: true } | { ok: false; reason: "mixed_vintage_panel" } {
  const present = panel.filter((o): o is TransformObservation => o !== null);
  const first = present[0];
  if (!first) return { ok: true };

  const commonPolicy = first.selectionPolicy;
  const consistent = commonPolicy
    ? present.every((o) => o.selectionPolicy === commonPolicy && isObservationEligible(o, commonPolicy))
    : first.snapshotAsOf != null && present.every((o) =>
        !o.selectionPolicy &&
        o.snapshotAsOf === first.snapshotAsOf &&
        (o.quality === "revised_latest") === (first.quality === "revised_latest") &&
        o.quality !== "conflict",
      );
  return consistent ? { ok: true } : { ok: false, reason: "mixed_vintage_panel" };
}

function runTransform(
  transform: HeadlineTransform,
  panel: TransformPanel,
  index: number,
  unit: string,
): VintageTransformResult {
  const numerator = panel[index];
  if (numerator && panel.some((o) => o !== null && o.seriesKey !== numerator.seriesKey)) {
    throw new TypeError("transform panel mixes seriesKey values");
  }

  const levels = Array.from(panel, (o) => ({
    iso: o?.observationPeriodStart ?? "",
    value: o?.value ?? null,
  }));
  const derived = deriveMetric(transform, index, levels);
  const lag = transform === "yoy_pct" ? 12 : 1;
  const operands: [TransformInputRef["role"], TransformObservation | null | undefined][] = [
    ["numerator", numerator],
    ["denominator", panel[index - lag]],
  ];
  if (derived?.prior != null) {
    operands.push(
      ["prior_numerator", panel[index - 1]],
      ["prior_denominator", panel[index - lag - 1]],
    );
  }
  const inputs = operands.flatMap<TransformInputRef>(([role, observation]) =>
    observation ? [{
      role,
      observationId: observation.id,
      observationPeriodStart: observation.observationPeriodStart,
      vintageKey: observation.vintageKey,
    }] : [],
  );
  if (!derived) {
    return { status: "missing", reason: "insufficient_vintage_panel", inputs };
  }
  const homogeneity = assertVintageHomogeneousPanel(operands.map(([, observation]) => observation ?? null));
  if (!homogeneity.ok) {
    return { status: "missing", reason: homogeneity.reason, inputs };
  }
  if (!Number.isFinite(derived.value) || (derived.prior !== null && !Number.isFinite(derived.prior))) {
    return { status: "missing", reason: "non_finite_value", inputs };
  }

  return { status: "ok", value: derived.value, prior: derived.prior, unit, inputs };
}

/** Month-over-month difference in thousands (payrolls). */
export function vintageConsistentMom(
  panel: TransformPanel,
  index: number,
): VintageTransformResult {
  return runTransform("mom_diff_thousands", panel, index, "thousands_mom");
}

/** Year-over-year percent change (CPI-style index). */
export function vintageConsistentYoy(
  panel: TransformPanel,
  index: number,
): VintageTransformResult {
  return runTransform("yoy_pct", panel, index, "pct_yoy");
}

/** Quarter-over-quarter percent annualized (real GDP). */
export function vintageConsistentQoqSaar(
  panel: TransformPanel,
  index: number,
): VintageTransformResult {
  return runTransform("qoq_pct_annualized", panel, index, "pct_saar");
}

/** Helper: locate the index of `period` in the panel. */
export function panelIndexForPeriod(
  panel: TransformPanel,
  period: string,
): number {
  return panel.findIndex(
    (o) => o !== null && o.observationPeriodStart === period,
  );
}
