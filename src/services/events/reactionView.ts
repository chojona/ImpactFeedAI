/**
 * Pure helpers for reading an `AssetReaction` by measure.
 *
 * Extracted from the components so the "which measure has data" logic has one
 * definition and can be unit-tested — it is the place where a null reading
 * would most easily be coerced into a zero.
 *
 * Everything here is deliberately non-interpolating. Each `ReactionMeasure` is
 * an independent observation with its own anchor — see
 * docs/superpowers/specs/2026-09-12-reaction-measurement-contract-design.md
 * §2 — not a point on a shared price path. A missing measure is skipped, never
 * filled, and a summary statistic must never be built by borrowing one
 * measure's observations to stand in for another (see `assertSingleMeasure`).
 */
import { assetMeta } from "@/lib/assets";
import {
  MEASURE_DESCRIPTIONS,
  MEASURE_LABELS,
  REACTION_MEASURES,
} from "@/services/events/reactionMeasures";
import type {
  AssetReaction,
  ReactionMeasure,
  ReactionSeriesPoint,
} from "@/types/events";

export { REACTION_MEASURES, MEASURE_LABELS };
export { MEASURE_DESCRIPTIONS };

export function pctForMeasure(
  asset: AssetReaction,
  measure: ReactionMeasure,
): number | null {
  return asset.measures[measure]?.pctChange ?? null;
}

/**
 * The endpoint price at this measure's checkpoint. Each measure is its own
 * observation with its own anchor, so this is never a point on one shared
 * path — see the module doc comment.
 */
export function priceForMeasure(
  asset: AssetReaction,
  measure: ReactionMeasure,
): number | null {
  return asset.measures[measure]?.endpointPrice ?? null;
}

/** Measures with a measured reading, in canonical order. */
export const measuredMeasures = (
  asset: AssetReaction,
): ReactionMeasure[] =>
  REACTION_MEASURES.filter((measure) => pctForMeasure(asset, measure) !== null);

/** Measures the contract defines but this asset has no reading for. */
export const unmeasuredMeasures = (
  asset: AssetReaction,
): ReactionMeasure[] =>
  REACTION_MEASURES.filter((measure) => pctForMeasure(asset, measure) === null);

/**
 * The measured readings as a plain series, in canonical measure order.
 *
 * There is no shared "T=0" anchor point here — v2's `reactionPath` prepended
 * one because every window shared a single `priceAtEvent` baseline. In v3 each
 * measure has its own anchor, so a synthetic shared start point would imply a
 * baseline the measures do not actually share. A gap is skipped rather than
 * interpolated: drawing a straight line through a missing measure would
 * invent an intermediate observation.
 */
export function measurementSeries(
  asset: AssetReaction,
): ReactionSeriesPoint[] {
  return measuredMeasures(asset).map((measure) => ({
    label: MEASURE_LABELS[measure],
    value: pctForMeasure(asset, measure) as number,
  }));
}

/* ─────────────────────────── cross-asset ranking ─────────────────────── */

export interface RankedReaction {
  asset: AssetReaction;
  value: number;
}

export interface MeasureRanking {
  /** Assets with a reading at this measure, strongest absolute move first. */
  measured: RankedReaction[];
  /** Assets with no reading at this measure. Never rendered as 0%. */
  unmeasured: AssetReaction[];
  /** Largest absolute measured move, used to scale bars. Null when empty. */
  maxAbs: number | null;
}

/**
 * Rank a set of assets by the size of their move at one measure.
 *
 * Unmeasured assets are returned separately rather than sorted to the bottom:
 * a bar chart that renders them at all would show a zero-length bar, which is
 * visually identical to a measured flat market.
 */
export function rankByMeasure(
  assets: readonly AssetReaction[],
  measure: ReactionMeasure,
): MeasureRanking {
  const measured: RankedReaction[] = [];
  const unmeasured: AssetReaction[] = [];

  for (const asset of assets) {
    const value = pctForMeasure(asset, measure);
    if (value === null) unmeasured.push(asset);
    else measured.push({ asset, value });
  }

  measured.sort(
    (a, b) =>
      Math.abs(b.value) - Math.abs(a.value) ||
      a.asset.symbol.localeCompare(b.asset.symbol),
  );

  return {
    measured,
    unmeasured,
    maxAbs:
      measured.length === 0
        ? null
        : Math.max(...measured.map((r) => Math.abs(r.value))),
  };
}

/**
 * The asset that moved most at a measure, or null when nothing was measured.
 * Used for the feed's representative reaction badge.
 */
export function strongestAtMeasure(
  assets: readonly AssetReaction[],
  measure: ReactionMeasure,
): RankedReaction | null {
  return rankByMeasure(assets, measure).measured[0] ?? null;
}

/* ─────────────────────── cross-measure pooling guard ───────────────────
 *
 * Spec §7.2: a summary statistic must never be produced without naming the
 * single measure it describes. This throws rather than silently pooling
 * because a caller that reaches it has already lost the measure tag on its
 * values — the bug it catches cannot be caught by a type check.
 */

/** Tags a raw value with the measure it was read from. */
export interface TaggedValue {
  measure: ReactionMeasure;
  value: number;
}

/**
 * Throws if `values` mixes more than one measure. Returns the single shared
 * measure otherwise (or null for an empty input, which callers treat as
 * insufficient data rather than an error).
 */
export function assertSingleMeasure(
  values: readonly TaggedValue[],
): ReactionMeasure | null {
  const measures = new Set(values.map((v) => v.measure));
  if (measures.size > 1) {
    throw new Error(
      `Refusing to pool values from more than one measure: ${[...measures].join(", ")}`,
    );
  }
  return values[0]?.measure ?? null;
}

/* ──────────────────────────────── formatting ─────────────────────────── */

/**
 * Percent change for display. Returns null for an unmeasured reading so the
 * caller has to decide what absence looks like, rather than receiving a string
 * that renders indistinguishably from a measured flat market.
 */
export const formatPercentChange = (value: number | null): string | null =>
  value === null || !Number.isFinite(value)
    ? null
    : `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;

/** Percentage points, for aggregate spreads rather than a single reading. */
export const formatPercentagePoints = (value: number | null): string | null =>
  value === null || !Number.isFinite(value)
    ? null
    : `${value > 0 ? "+" : ""}${value.toFixed(2)}pp`;

export const assetDisplayName = (symbol: string): string =>
  assetMeta(symbol).name;
