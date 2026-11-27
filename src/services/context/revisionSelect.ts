/**
 * Strict macro revision/period selection for Phase 1.1.
 *
 * Market observation eligibility for feature math lives in `pointInTime.ts`
 * (shared with PR #16). Both enforce `availableAt < cutoff`.
 */

import { isObservationEligible } from "@/services/context/quality";
import type {
  ConflictRecord,
  ContextObservation,
  PointInTimePolicy,
  SelectionResult,
} from "@/types/context";

function byPeriodThenRealtime(
  a: ContextObservation,
  b: ContextObservation,
): number {
  if (a.observationPeriodStart !== b.observationPeriodStart) {
    return a.observationPeriodStart < b.observationPeriodStart ? -1 : 1;
  }
  if (a.realtimeStart !== b.realtimeStart) {
    return a.realtimeStart < b.realtimeStart ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Quarantine conflicting payloads that claim the same immutable revision key.
 * Identical payload hashes are idempotent duplicates (not conflicts).
 */
export function detectRevisionConflicts(
  observations: readonly ContextObservation[],
): {
  readonly clean: ContextObservation[];
  readonly conflicts: ConflictRecord[];
  readonly quarantined: ContextObservation[];
} {
  const byKey = new Map<string, ContextObservation[]>();
  for (const obs of observations) {
    const list = byKey.get(obs.vintageKey) ?? [];
    list.push(obs);
    byKey.set(obs.vintageKey, list);
  }

  const clean: ContextObservation[] = [];
  const conflicts: ConflictRecord[] = [];
  const quarantined: ContextObservation[] = [];

  for (const [vintageKey, group] of byKey) {
    const hashes = [...new Set(group.map((g) => g.payloadHash))];
    if (hashes.length > 1) {
      conflicts.push({
        vintageKey,
        seriesKey: group[0].seriesKey,
        observationPeriodStart: group[0].observationPeriodStart,
        observationIds: group.map((g) => g.id),
        payloadHashes: hashes,
        reason: "conflicting_payload_for_immutable_revision",
      });
      for (const g of group) {
        quarantined.push({ ...g, quality: "conflict" });
      }
      continue;
    }
    // Idempotent: keep a single representative.
    clean.push(group[0]);
  }

  clean.sort(byPeriodThenRealtime);
  return { clean, conflicts, quarantined };
}

function eligibleForSeries(
  observations: readonly ContextObservation[],
  seriesKey: string,
  policy: PointInTimePolicy,
): ContextObservation[] {
  return observations
    .filter((o) => o.seriesKey === seriesKey)
    .filter((o) => isObservationEligible(o, policy))
    .sort(byPeriodThenRealtime);
}

/**
 * Latest eligible revision within one observation period.
 */
export function selectRevisionForPeriod(
  observations: readonly ContextObservation[],
  seriesKey: string,
  observationPeriodStart: string,
  policy: PointInTimePolicy,
): SelectionResult {
  const { clean, quarantined } = detectRevisionConflicts(observations);
  const conflicted = quarantined.filter(
    (o) =>
      o.seriesKey === seriesKey &&
      o.observationPeriodStart === observationPeriodStart,
  );
  if (conflicted.length > 0) {
    return {
      status: "missing",
      reason: "conflict_quarantined",
      seriesKey,
      observationPeriodStart,
      observationIds: conflicted.map((o) => o.id),
    };
  }

  const pool = eligibleForSeries(clean, seriesKey, policy).filter(
    (o) => o.observationPeriodStart === observationPeriodStart,
  );

  if (pool.length === 0) {
    const anyPeriod = clean.filter(
      (o) =>
        o.seriesKey === seriesKey &&
        o.observationPeriodStart === observationPeriodStart,
    );
    const reason =
      anyPeriod.find((o) => o.quality === "revised_latest") &&
      !policy.allowRevisedLatest
        ? ("revised_latest_ineligible" as const)
        : anyPeriod.some(
              (o) =>
                o.availableAt &&
                o.availableAt.getTime() >= policy.cutoff.getTime(),
            )
          ? ("not_available_before_cutoff" as const)
          : ("no_observation_for_period" as const);
    return {
      status: "missing",
      reason,
      seriesKey,
      observationPeriodStart,
      observationIds: anyPeriod.map((o) => o.id),
    };
  }

  const selected = pool[pool.length - 1];
  return { status: "selected", observation: selected };
}

/**
 * Choose the latest economic reference period among eligible observations,
 * then the latest revision within that period. A later revision of an older
 * period never displaces a newer period.
 */
export function selectLatestEconomicObservation(
  observations: readonly ContextObservation[],
  seriesKey: string,
  policy: PointInTimePolicy,
): SelectionResult {
  const { clean } = detectRevisionConflicts(observations);
  const eligible = eligibleForSeries(clean, seriesKey, policy);
  if (eligible.length === 0) {
    return {
      status: "missing",
      reason: "no_observation_for_period",
      seriesKey,
      observationIds: clean
        .filter((o) => o.seriesKey === seriesKey)
        .map((o) => o.id),
    };
  }

  const latestPeriod =
    eligible[eligible.length - 1].observationPeriodStart;
  return selectRevisionForPeriod(
    clean,
    seriesKey,
    latestPeriod,
    policy,
  );
}

/**
 * Build a vintage-consistent level panel: for each requested period, the
 * revision eligible under `policy`. Missing periods yield explicit holes.
 */
export function selectVintageConsistentPanel(
  observations: readonly ContextObservation[],
  seriesKey: string,
  periods: readonly string[],
  policy: PointInTimePolicy,
): {
  readonly panel: Array<ContextObservation | null>;
  readonly failures: SelectionResult[];
} {
  const panel: Array<ContextObservation | null> = [];
  const failures: SelectionResult[] = [];
  for (const period of periods) {
    const result = selectRevisionForPeriod(
      observations,
      seriesKey,
      period,
      policy,
    );
    if (result.status === "selected") {
      panel.push(result.observation);
    } else {
      panel.push(null);
      failures.push(result);
    }
  }
  return { panel, failures };
}
