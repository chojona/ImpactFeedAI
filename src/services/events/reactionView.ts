/**
 * Small pure helpers for reading an `AssetReaction` by window.
 *
 * Extracted from the components so the "which window has data" logic has one
 * definition and can be unit-tested — it is the place where a null reading
 * would most easily be coerced into a zero.
 */
import type {
  AssetReaction,
  ReactionSeriesPoint,
  ReactionWindow,
} from "@/types/events";

export const WINDOW_LABELS: Record<ReactionWindow, string> = {
  "1h": "1H",
  "1d": "1D",
  "1w": "1W",
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

/**
 * The reaction path as cumulative percent change from the anchor.
 *
 * Always starts at 0 (the anchor, by definition), then appends only the windows
 * that were actually measured. A gap is skipped rather than interpolated: drawing
 * a straight line through a missing +1h reading would invent an intermediate
 * observation, and the line between two real points is already understood as a
 * connector rather than a measurement.
 */
export function reactionSeries(asset: AssetReaction): ReactionSeriesPoint[] {
  const points: ReactionSeriesPoint[] = [{ label: "T", value: 0 }];
  for (const window of ["1h", "1d", "1w"] as const) {
    const pct = pctForWindow(asset, window);
    if (pct !== null) points.push({ label: WINDOW_LABELS[window], value: pct });
  }
  return points;
}
