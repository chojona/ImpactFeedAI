import type {
  Direction,
  EventCategory,
  NewsEvent,
  ReactionWindow,
} from "@/types/events";
import { assetMeta, compareAssetSymbols } from "@/lib/assets";
import { CURRENT_REACTION_CALCULATION_VERSION } from "@/services/events/timing";

/**
 * Per-category aggregate reaction statistics.
 *
 * The aggregation only ever sees measured one-session moves. It deliberately
 * reads `pct1d` instead of the feed's headline field: substituting a one-week or
 * one-hour return when 1d is absent would combine incompatible horizons in a
 * single mean. Null and non-finite readings are dropped before aggregation.
 *
 * `eventCount` therefore reports how many events actually contributed to each
 * asset's average, which is the sample size a reader needs in order to discount
 * it. Per docs/research-methodology.md: a distribution without its sample size
 * is not evidence.
 */

export interface AssetPattern {
  symbol: string;
  avgPercentChange: number;
  direction: Direction;
  /** Share of contributing events that moved in the average's direction. */
  winRate: number;
  /** Events with a measured move for this asset. */
  eventCount: number;
}

export interface CategoryPattern {
  category: EventCategory;
  avgReactions: AssetPattern[];
  mostConsistentAsset: string | null;
  biggestMover: string | null;
  /** Events in the category, including any with no usable reaction rows. */
  sampleSize: number;
  /** Events that contributed at least one measured move. */
  measuredSampleSize: number;
}

/** Minimum contributing events before an asset can be called "most consistent". */
const MIN_CONSISTENCY_SAMPLE = 2;

export function analyzeCategory(
  events: NewsEvent[],
  category: EventCategory,
): CategoryPattern {
  const inCategory = events.filter((e) => e.category === category);

  const bySymbol = new Map<
    string,
    { move: number; direction: Direction }[]
  >();
  let measuredSampleSize = 0;

  for (const event of inCategory) {
    if (!event.timing.reactionEligible) continue;
    let contributed = false;
    for (const asset of event.assets) {
      if (
        asset.calculationVersion !== CURRENT_REACTION_CALCULATION_VERSION
      ) {
        continue;
      }
      const move = asset.pct1d;
      if (move === null || !Number.isFinite(move)) continue;
      contributed = true;
      const direction: Direction = move > 0 ? "UP" : move < 0 ? "DOWN" : "FLAT";
      const list = bySymbol.get(asset.symbol);
      const observation = { move, direction };
      if (list) list.push(observation);
      else bySymbol.set(asset.symbol, [observation]);
    }
    if (contributed) measuredSampleSize += 1;
  }

  const avgReactions: AssetPattern[] = [];
  for (const [symbol, reactions] of bySymbol) {
    const sum = reactions.reduce((acc, reaction) => acc + reaction.move, 0);
    const avg = sum / reactions.length;
    const direction: Direction = avg > 0 ? "UP" : avg < 0 ? "DOWN" : "FLAT";
    const matches = reactions.filter(
      (reaction) => reaction.direction === direction,
    ).length;
    avgReactions.push({
      symbol,
      avgPercentChange: avg,
      direction,
      winRate: matches / reactions.length,
      eventCount: reactions.length,
    });
  }

  avgReactions.sort(
    (a, b) =>
      Math.abs(b.avgPercentChange) - Math.abs(a.avgPercentChange) ||
      a.symbol.localeCompare(b.symbol),
  );

  const biggestMover = avgReactions[0]?.symbol ?? null;

  let mostConsistent: AssetPattern | null = null;
  for (const a of avgReactions) {
    if (a.eventCount < MIN_CONSISTENCY_SAMPLE) continue;
    if (
      !mostConsistent ||
      a.winRate > mostConsistent.winRate ||
      (a.winRate === mostConsistent.winRate &&
        a.eventCount > mostConsistent.eventCount)
    ) {
      mostConsistent = a;
    }
  }

  return {
    category,
    avgReactions,
    // Deliberately null rather than falling back to a single-observation asset:
    // "most consistent" over one event is not a consistency claim.
    mostConsistentAsset: mostConsistent?.symbol ?? null,
    biggestMover,
    sampleSize: inCategory.length,
    measuredSampleSize,
  };
}

/* ────────────────── per-horizon profiles over measured moves ───────────── */

/**
 * One event's measured moves for one instrument.
 *
 * Produced by `listReactionObservations`, which applies the same timing and
 * calculation-version gate as the row mapper. Each window is independently
 * nullable because coverage is uneven: Yahoo only retains ~730 days of intraday
 * history, so an older event can have a one-day and one-week reading with no
 * one-hour reading at all.
 */
export interface ReactionObservation {
  eventId: string;
  title: string;
  /** Release instant, ISO 8601 UTC. */
  at: string;
  category: EventCategory;
  symbol: string;
  values: Record<ReactionWindow, number | null>;
}

export interface HorizonStats {
  window: ReactionWindow;
  /** Observations behind every number in this row. Never inferred upward. */
  count: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  positive: number;
  negative: number;
  flat: number;
}

export interface AssetProfile {
  symbol: string;
  name: string;
  horizons: Record<ReactionWindow, HorizonStats | null>;
  /** Distinct events contributing at least one measured window. */
  events: number;
}

export interface CategoryProfile {
  category: EventCategory;
  /** Distinct events with at least one measured move in any window. */
  measuredEvents: number;
  assets: AssetProfile[];
}

/**
 * Below this many observations an aggregate is reported as a raw count rather
 * than as a central tendency. Three is not a defensible "typical reaction"; it
 * is three numbers, and the UI says so.
 */
export const MIN_AGGREGATE_SAMPLE = 3;

/** Enough observations to be worth drawing as a distribution. */
export const MIN_DISTRIBUTION_SAMPLE = 3;

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function statsFor(
  window: ReactionWindow,
  values: readonly number[],
): HorizonStats | null {
  if (values.length === 0) return null;
  return {
    window,
    count: values.length,
    mean: values.reduce((acc, v) => acc + v, 0) / values.length,
    median: median(values),
    min: Math.min(...values),
    max: Math.max(...values),
    positive: values.filter((v) => v > 0).length,
    negative: values.filter((v) => v < 0).length,
    flat: values.filter((v) => v === 0).length,
  };
}

const WINDOWS: readonly ReactionWindow[] = ["1h", "1d", "1w"];

/**
 * Aggregate observations into per-asset, per-horizon statistics.
 *
 * Each horizon is summarised over its own observations only. Borrowing a
 * one-week reading to stand in for a missing one-day reading would put two
 * different financial questions in the same average, which is the failure the
 * one-fixed-horizon rule in `analyzeCategory` already guards against.
 */
export function profileObservations(
  observations: readonly ReactionObservation[],
  category: EventCategory,
): CategoryProfile {
  const inCategory = observations.filter((o) => o.category === category);

  const bySymbol = new Map<
    string,
    { values: Record<ReactionWindow, number[]>; events: Set<string> }
  >();
  const measuredEvents = new Set<string>();

  for (const observation of inCategory) {
    let entry = bySymbol.get(observation.symbol);
    if (!entry) {
      entry = { values: { "1h": [], "1d": [], "1w": [] }, events: new Set() };
      bySymbol.set(observation.symbol, entry);
    }
    let contributed = false;
    for (const window of WINDOWS) {
      const value = observation.values[window];
      if (value === null || !Number.isFinite(value)) continue;
      entry.values[window].push(value);
      contributed = true;
    }
    if (contributed) {
      entry.events.add(observation.eventId);
      measuredEvents.add(observation.eventId);
    }
  }

  const assets: AssetProfile[] = [];
  for (const [symbol, entry] of bySymbol) {
    if (entry.events.size === 0) continue;
    assets.push({
      symbol,
      name: assetMeta(symbol).name,
      events: entry.events.size,
      horizons: {
        "1h": statsFor("1h", entry.values["1h"]),
        "1d": statsFor("1d", entry.values["1d"]),
        "1w": statsFor("1w", entry.values["1w"]),
      },
    });
  }

  // Rank by the size of the typical one-session move, the horizon the rest of
  // the app headlines. Assets with no one-day coverage sort last rather than
  // being promoted by a larger reading at another horizon.
  assets.sort((a, b) => {
    const am = a.horizons["1d"];
    const bm = b.horizons["1d"];
    if (am === null && bm === null) return compareAssetSymbols(a.symbol, b.symbol);
    if (am === null) return 1;
    if (bm === null) return -1;
    return (
      Math.abs(bm.median) - Math.abs(am.median) ||
      compareAssetSymbols(a.symbol, b.symbol)
    );
  });

  return { category, measuredEvents: measuredEvents.size, assets };
}

export interface DistributionPoint {
  eventId: string;
  title: string;
  at: string;
  value: number;
}

/**
 * The individual observations behind an aggregate, for a dot plot.
 *
 * Returned as raw points rather than as binned density: at the sample sizes
 * this library currently supports, a smoothed distribution would imply a
 * confidence the data does not carry. Every dot is one real event, and the UI
 * can name it.
 */
export function distributionFor(
  observations: readonly ReactionObservation[],
  category: EventCategory,
  symbol: string,
  window: ReactionWindow,
): DistributionPoint[] {
  const points: DistributionPoint[] = [];
  for (const observation of observations) {
    if (observation.category !== category) continue;
    if (observation.symbol !== symbol) continue;
    const value = observation.values[window];
    if (value === null || !Number.isFinite(value)) continue;
    points.push({
      eventId: observation.eventId,
      title: observation.title,
      at: observation.at,
      value,
    });
  }
  return points.sort((a, b) => a.value - b.value);
}

/* ─────────────────── one canonical summary of a distribution ───────────── */

/**
 * Where one event's observation sits inside the distribution it belongs to.
 *
 * `rank` is 1-based from the most negative move, so rank 1 is the worst
 * reaction in the set and `rank === count` is the best. It is resolved by
 * identity rather than by value: two events that moved by exactly the same
 * amount are still two distinct observations, and collapsing them would
 * misreport the sample.
 */
export interface SelectedObservation {
  eventId: string;
  value: number;
  /** 1-based position in ascending value order. */
  rank: number;
  /**
   * Share of observations at or below this one, 0–1. Null below
   * {@link MIN_DISTRIBUTION_SAMPLE} — a percentile over two observations is
   * arithmetic, not a percentile.
   */
  percentile: number | null;
  /** Signed distance from the median, in percentage points. */
  vsMedian: number;
}

/**
 * Every statistic a distribution view needs, computed once.
 *
 * Both the dot plot and its caption read this object rather than recomputing
 * from the points, so the marks on the chart and the numbers underneath it
 * cannot disagree — the failure mode that integrity rule 8 exists to prevent.
 *
 * `sufficient` is the honesty gate. Below {@link MIN_DISTRIBUTION_SAMPLE} the
 * central-tendency fields are still populated (they are well-defined
 * arithmetic) but callers must not present them as a typical reaction, and the
 * mean in particular should be withheld: over two observations it is just the
 * midpoint of two numbers wearing a statistical name.
 */
export interface DistributionSummary {
  symbol: string;
  window: ReactionWindow;
  /** Observations behind every figure here. Never inferred upward. */
  count: number;
  median: number;
  mean: number;
  min: number;
  max: number;
  /** Observed spread, max − min, in percentage points. */
  range: number;
  positive: number;
  negative: number;
  flat: number;
  /** False when the sample is too thin to describe as a distribution. */
  sufficient: boolean;
  /** The event being examined, when it is present in this set. */
  selected: SelectedObservation | null;
}

export interface SummarizeDistributionOptions {
  symbol: string;
  window: ReactionWindow;
  /** Event to locate within the set. Absent from the set means no selection. */
  selectedEventId?: string | null;
}

/**
 * Summarise a set of observations, optionally locating one of them.
 *
 * Returns null for an empty set rather than a zero-filled summary: a
 * distribution of nothing has no median, and a `count: 0` object with `median:
 * 0` is the exact shape that renders as a measured flat market.
 */
export function summarizeDistribution(
  points: readonly DistributionPoint[],
  { symbol, window, selectedEventId = null }: SummarizeDistributionOptions,
): DistributionSummary | null {
  if (points.length === 0) return null;

  const ascending = [...points].sort(
    (a, b) => a.value - b.value || a.eventId.localeCompare(b.eventId),
  );
  const values = ascending.map((p) => p.value);
  const count = values.length;
  const med = median(values);
  const sufficient = count >= MIN_DISTRIBUTION_SAMPLE;

  const index =
    selectedEventId === null
      ? -1
      : ascending.findIndex((p) => p.eventId === selectedEventId);

  const selected: SelectedObservation | null =
    index === -1
      ? null
      : {
          eventId: ascending[index].eventId,
          value: ascending[index].value,
          rank: index + 1,
          percentile: sufficient ? (index + 1) / count : null,
          vsMedian: ascending[index].value - med,
        };

  return {
    symbol,
    window,
    count,
    median: med,
    mean: values.reduce((acc, v) => acc + v, 0) / count,
    min: values[0],
    max: values[count - 1],
    range: values[count - 1] - values[0],
    positive: values.filter((v) => v > 0).length,
    negative: values.filter((v) => v < 0).length,
    flat: values.filter((v) => v === 0).length,
    sufficient,
    selected,
  };
}
