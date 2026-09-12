/**
 * Plot geometry for the reaction chart, as pure functions.
 *
 * Kept out of the component so the part that can silently lie — where a point
 * lands relative to the zero line, and whether an unmeasured measure occupies
 * a position at all — is unit-testable without a DOM.
 *
 * Coordinates are percentages of the plot box, so the component can position
 * SVG geometry and HTML labels in the same coordinate system and stay crisp at
 * every viewport size.
 *
 * ### Why four ordinal slots rather than a time axis
 *
 * `RELEASE_SESSION`, `SESSION_PLUS_1` and `SESSION_PLUS_5` are trading
 * sessions apart, not a fixed number of hours — a holiday can widen any of
 * those gaps — and `INTRADAY_60M` sits inside the first of them. On a
 * time-proportional axis the three session measures would collide near one
 * edge while the intraday point floats almost on top of them. The slots are
 * therefore evenly spaced and labelled with the measure identity, and the
 * component states that the axis is not to scale.
 *
 * ### Why there is no shared anchor point
 *
 * v2 plotted `priceAtEvent` as a shared "T=0" point every window inherited.
 * In v3 each measure has its OWN independent anchor (see spec §2) — there is
 * no single baseline the four measures share, so synthesising a shared start
 * point would assert a baseline that does not exist. Each measure is either
 * plotted at its own value or, when unmeasured, contributes no point at all.
 */
import {
  MEASURE_LABELS,
  REACTION_MEASURES,
  pctForMeasure,
  priceForMeasure,
} from "@/services/events/reactionView";
import type { AssetReaction, ReactionMeasure } from "@/types/events";

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
  measure: ReactionMeasure;
  label: string;
  xPct: number;
}

export interface PlotPoint extends PlotSlot {
  value: number;
  price: number | null;
  yPct: number;
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
  /** Every measure the contract defines, measured or not. */
  slots: PlotSlot[];
  focus: PlotSeries | null;
  /** Faint background series for cross-asset context. */
  context: PlotSeries[];
  ticks: PlotTick[];
  zeroYPct: number;
  halfDomain: number;
  /** Measures the focused asset has no reading for. Never plotted. */
  missingMeasures: ReactionMeasure[];
}

const slotXPct = (index: number, count: number): number =>
  count <= 1 ? 50 : X_INSET + (index * (100 - 2 * X_INSET)) / (count - 1);

/** All four positions, so an unmeasured measure is a visible gap, not a zero. */
export function plotSlots(): PlotSlot[] {
  return REACTION_MEASURES.map((measure, index) => ({
    measure,
    label: MEASURE_LABELS[measure],
    xPct: slotXPct(index, REACTION_MEASURES.length),
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
    const value = pctForMeasure(asset, slot.measure);
    // A missing measure contributes no point at all. Emitting one at y=0
    // would draw an unmeasured measure as a measured flat market.
    if (value === null) continue;
    points.push({
      ...slot,
      value,
      price: priceForMeasure(asset, slot.measure),
      yPct: yPctFor(value, halfDomain),
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
    for (const measure of REACTION_MEASURES) {
      const value = pctForMeasure(asset, measure);
      if (value !== null) values.push(value);
    }
  }

  const halfDomain = halfDomainFor(values);

  return {
    slots,
    focus: focus === null ? null : seriesFor(focus, slots, halfDomain),
    context: contextSeriesAssets
      .map((asset) => seriesFor(asset, slots, halfDomain))
      // A context series with fewer than two points draws no useful line.
      .filter((series) => series.points.length > 1),
    ticks: ticksFor(halfDomain),
    zeroYPct: yPctFor(0, halfDomain),
    halfDomain,
    missingMeasures:
      focus === null
        ? [...REACTION_MEASURES]
        : REACTION_MEASURES.filter((m) => pctForMeasure(focus, m) === null),
  };
}

/** `points` attribute for a polyline through the given plot points. */
export const polylinePoints = (points: readonly PlotPoint[]): string =>
  points.map((p) => `${p.xPct},${p.yPct}`).join(" ");
