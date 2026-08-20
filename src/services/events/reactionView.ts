/**
 * Pure helpers for reading an `AssetReaction` by window.
 *
 * Extracted from the components so the "which window has data" logic has one
 * definition and can be unit-tested — it is the place where a null reading
 * would most easily be coerced into a zero.
 *
 * Everything here is deliberately non-interpolating. The schema stores four
 * prices per asset (anchor, +1h, +1d, +1w), which is a set of *observations*,
 * not a price path. A missing window is skipped, never filled, and the
 * components render the connector between two observations as a dashed line so
 * it cannot be mistaken for measured intraday data.
 */
import { assetMeta } from "@/lib/assets";
import type {
  AssetReaction,
  ReactionSeriesPoint,
  ReactionWindow,
} from "@/types/events";

/** Every window the schema can store, in chronological order. */
export const REACTION_WINDOWS: readonly ReactionWindow[] = ["1h", "1d", "1w"];

export const WINDOW_LABELS: Record<ReactionWindow, string> = {
  "1h": "1H",
  "1d": "1D",
  "1w": "1W",
};

/** Long-form window descriptions, used in tooltips and screen-reader text. */
export const WINDOW_DESCRIPTIONS: Record<ReactionWindow, string> = {
  "1h": "one hour after the release instant",
  "1d": "one session after the release session",
  "1w": "one week after the release session",
};

export function pctForWindow(
  asset: AssetReaction,
  window: ReactionWindow,
): number | null {
  switch (window) {
    case "1h":
      return asset.pct1h;
    case "1d":
      return asset.pct1d;
    case "1w":
      return asset.pct1w;
  }
}

export function priceForWindow(
  asset: AssetReaction,
  window: ReactionWindow,
): number | null {
  switch (window) {
    case "1h":
      return asset.price1h;
    case "1d":
      return asset.price1d;
    case "1w":
      return asset.price1w;
  }
}

/** Windows with a measured reading, in chronological order. */
export const measuredWindows = (
  asset: AssetReaction,
): ReactionWindow[] =>
  REACTION_WINDOWS.filter((window) => pctForWindow(asset, window) !== null);

/** Windows the schema supports but this asset has no reading for. */
export const unmeasuredWindows = (
  asset: AssetReaction,
): ReactionWindow[] =>
  REACTION_WINDOWS.filter((window) => pctForWindow(asset, window) === null);

/**
 * One plotted observation. `window` is null for the release anchor, which is
 * 0% by definition rather than by measurement — the distinction matters when
 * labelling a point as observed data.
 */
export interface ReactionPathPoint {
  window: ReactionWindow | null;
  label: string;
  /** Cumulative percent change from the pre-release baseline. */
  value: number;
  /** Absolute price at the window, when the row stored one. */
  price: number | null;
}

/**
 * The reaction path as cumulative percent change from the anchor.
 *
 * Always starts at 0 (the anchor, by definition), then appends only the windows
 * that were actually measured. A gap is skipped rather than interpolated:
 * drawing a straight line through a missing +1h reading would invent an
 * intermediate observation.
 */
export function reactionPath(asset: AssetReaction): ReactionPathPoint[] {
  const points: ReactionPathPoint[] = [
    { window: null, label: "T", value: 0, price: asset.priceAtEvent },
  ];
  for (const window of REACTION_WINDOWS) {
    const pct = pctForWindow(asset, window);
    if (pct === null) continue;
    points.push({
      window,
      label: WINDOW_LABELS[window],
      value: pct,
      price: priceForWindow(asset, window),
    });
  }
  return points;
}

/** Narrow projection of {@link reactionPath}, kept for the sparkline contract. */
export const reactionSeries = (
  asset: AssetReaction,
): ReactionSeriesPoint[] =>
  reactionPath(asset).map(({ label, value }) => ({ label, value }));

/* ─────────────────────────── cross-asset ranking ─────────────────────── */

export interface RankedReaction {
  asset: AssetReaction;
  value: number;
}

export interface WindowRanking {
  /** Assets with a reading at this window, strongest absolute move first. */
  measured: RankedReaction[];
  /** Assets with no reading at this window. Never rendered as 0%. */
  unmeasured: AssetReaction[];
  /** Largest absolute measured move, used to scale bars. Null when empty. */
  maxAbs: number | null;
}

/**
 * Rank a set of assets by the size of their move at one window.
 *
 * Unmeasured assets are returned separately rather than sorted to the bottom:
 * a bar chart that renders them at all would show a zero-length bar, which is
 * visually identical to a measured flat market.
 */
export function rankByWindow(
  assets: readonly AssetReaction[],
  window: ReactionWindow,
): WindowRanking {
  const measured: RankedReaction[] = [];
  const unmeasured: AssetReaction[] = [];

  for (const asset of assets) {
    const value = pctForWindow(asset, window);
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
 * The asset that moved most at a window, or null when nothing was measured.
 * Used for the feed's representative reaction badge.
 */
export function strongestAtWindow(
  assets: readonly AssetReaction[],
  window: ReactionWindow,
): RankedReaction | null {
  return rankByWindow(assets, window).measured[0] ?? null;
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
