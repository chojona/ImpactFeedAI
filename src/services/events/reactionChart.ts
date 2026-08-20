/**
 * Plot geometry for the reaction chart, as pure functions.
 *
 * Kept out of the component so the part that can silently lie — where a point
 * lands relative to the zero line, and whether an unmeasured window occupies a
 * position at all — is unit-testable without a DOM.
 *
 * Coordinates are percentages of the plot box, so the component can position
 * SVG geometry and HTML labels in the same coordinate system and stay crisp at
 * every viewport size.
 *
 * ### Why four ordinal slots rather than a time axis
 *
 * The schema stores observations at T, T+1h, T+1d and T+1w. Those are 0, 1, 24
 * and 168 hours apart. On a time-proportional axis the anchor and the one-hour
 * reading collide in a single pixel while 95% of the width is the empty gap
 * before the one-week point. The slots are therefore evenly spaced and labelled
 * with the window identity, and the component states that the axis is not to
 * scale. When intraday candles exist, a real time axis becomes possible; that
 * is a new builder alongside this one, not a change to it.
 */
import {
  REACTION_WINDOWS,
  WINDOW_LABELS,
  pctForWindow,
  priceForWindow,
} from "@/services/events/reactionView";
import type { AssetReaction, ReactionWindow } from "@/types/events";

/** Horizontal inset so the first and last markers are not clipped. */
const X_INSET = 6;

/** Headroom above the largest move so a marker never touches the frame. */
const DOMAIN_PADDING = 1.25;

/**
 * Smallest half-domain, in percent. Without a floor, an event where every asset
 * moved 0.01% would render as a dramatic chart of noise.
 */
const MIN_HALF_DOMAIN = 0.25;

export interface PlotSlot {
  /** Null for the release anchor. */
  window: ReactionWindow | null;
  label: string;
  xPct: number;
}

export interface PlotPoint extends PlotSlot {
  value: number;
  price: number | null;
  yPct: number;
  /** False for the anchor, which is 0% by definition rather than measurement. */
  measured: boolean;
}

export interface PlotSeries {
  symbol: string;
  name: string;
  points: PlotPoint[];
}

export interface PlotTick {
  value: number;
  yPct: number;
  label: string;
}

export interface ReactionPlot {
  /** Every window the schema supports, measured or not. */
  slots: PlotSlot[];
  focus: PlotSeries | null;
  /** Faint background series for cross-asset context. */
  context: PlotSeries[];
  ticks: PlotTick[];
  zeroYPct: number;
  halfDomain: number;
  /** Windows the focused asset has no reading for. Never plotted. */
  missingWindows: ReactionWindow[];
}

const slotXPct = (index: number, count: number): number =>
  count <= 1 ? 50 : X_INSET + (index * (100 - 2 * X_INSET)) / (count - 1);

/** All four positions, so an unmeasured window is a visible gap, not a zero. */
export function plotSlots(): PlotSlot[] {
  const windows: (ReactionWindow | null)[] = [null, ...REACTION_WINDOWS];
  return windows.map((window, index) => ({
    window,
    label: window === null ? "T" : `+${WINDOW_LABELS[window]}`,
    xPct: slotXPct(index, windows.length),
  }));
}

/**
 * Symmetric domain around zero. Symmetry is deliberate: it puts the baseline in
 * the same place on every chart, so the sign of a move is readable before the
 * numbers are.
 */
export function halfDomainFor(values: readonly number[]): number {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return MIN_HALF_DOMAIN;
  const largest = Math.max(...finite.map(Math.abs));
  return Math.max(MIN_HALF_DOMAIN, largest * DOMAIN_PADDING);
}

const yPctFor = (value: number, halfDomain: number): number =>
  50 - (value / halfDomain) * 50;

function seriesFor(
  asset: AssetReaction,
  slots: readonly PlotSlot[],
  halfDomain: number,
): PlotSeries {
  const points: PlotPoint[] = [];
  for (const slot of slots) {
    if (slot.window === null) {
      points.push({
        ...slot,
        value: 0,
        price: asset.priceAtEvent,
        yPct: yPctFor(0, halfDomain),
        measured: false,
      });
      continue;
    }
    const value = pctForWindow(asset, slot.window);
    // A missing window contributes no point at all. Emitting one at y=0 would
    // draw an unmeasured window as a measured flat market.
    if (value === null) continue;
    points.push({
      ...slot,
      value,
      price: priceForWindow(asset, slot.window),
      yPct: yPctFor(value, halfDomain),
      measured: true,
    });
  }
  return { symbol: asset.symbol, name: asset.name, points };
}

const TICK_FRACTIONS = [1, 0.5, 0, -0.5, -1] as const;

function ticksFor(halfDomain: number): PlotTick[] {
  return TICK_FRACTIONS.map((fraction) => {
    const value = halfDomain * fraction;
    return {
      value,
      yPct: yPctFor(value, halfDomain),
      label:
        value === 0
          ? "0%"
          : `${value > 0 ? "+" : ""}${value.toFixed(halfDomain < 1 ? 2 : 1)}%`,
    };
  });
}

export interface BuildPlotInput {
  focus: AssetReaction | null;
  /** Other assets on the same event, drawn faintly behind the focus series. */
  context?: readonly AssetReaction[];
}

/**
 * Build the full plot model. The domain spans the focus *and* the context
 * series so the faint comparison paths are on the same scale as the focused
 * one — a background line drawn on its own scale would misrepresent every
 * comparison the chart exists to support.
 */
export function buildReactionPlot({
  focus,
  context = [],
}: BuildPlotInput): ReactionPlot {
  const slots = plotSlots();
  const contextSeriesAssets = context.filter(
    (asset) => focus === null || asset.symbol !== focus.symbol,
  );

  const values: number[] = [];
  for (const asset of [...(focus ? [focus] : []), ...contextSeriesAssets]) {
    for (const window of REACTION_WINDOWS) {
      const value = pctForWindow(asset, window);
      if (value !== null) values.push(value);
    }
  }

  const halfDomain = halfDomainFor(values);

  return {
    slots,
    focus: focus === null ? null : seriesFor(focus, slots, halfDomain),
    context: contextSeriesAssets
      .map((asset) => seriesFor(asset, slots, halfDomain))
      // A context series with only the anchor point draws nothing useful.
      .filter((series) => series.points.length > 1),
    ticks: ticksFor(halfDomain),
    zeroYPct: yPctFor(0, halfDomain),
    halfDomain,
    missingWindows:
      focus === null
        ? [...REACTION_WINDOWS]
        : REACTION_WINDOWS.filter((w) => pctForWindow(focus, w) === null),
  };
}

/** `points` attribute for a polyline through the given plot points. */
export const polylinePoints = (points: readonly PlotPoint[]): string =>
  points.map((p) => `${p.xPct},${p.yPct}`).join(" ");
