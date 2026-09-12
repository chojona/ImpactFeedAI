import type { Direction, EventCategory, NewsEvent, SessionBasis } from "@/types/events";
import { assetMeta, compareAssetSymbols } from "@/lib/assets";
import { HEADLINE_MEASURE, REACTION_MEASURES } from "@/services/events/reactionMeasures";
import { assertSingleMeasure, type TaggedValue } from "@/services/events/reactionView";
import type { ReactionMeasure } from "@/types/events";

/**
 * Per-category aggregate reaction statistics.
 *
 * The aggregation only ever sees measured `HEADLINE_MEASURE` (`RELEASE_SESSION`)
 * moves. It deliberately reads `asset.measures.RELEASE_SESSION` directly rather
 * than `asset.percentChange`: the two happen to agree today because the
 * mapper's headline is also `RELEASE_SESSION`, but reading the measure by name
 * documents the actual invariant this aggregate depends on, rather than an
 * incidental agreement between two independently-changeable fields.
 * Substituting `SESSION_PLUS_1` or `INTRADAY_60M` when `RELEASE_SESSION` is
 * absent would combine incompatible measures in a single mean. Null and
 * non-finite readings are dropped before aggregation.
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
      const move = asset.measures[HEADLINE_MEASURE]?.pctChange ?? null;
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

/* ────────────────── per-measure profiles over measured moves ───────────── */

/**
 * One event's measured moves for one instrument.
 *
 * Produced by `listReactionObservations`, which applies the same timing and
 * calculation-version gate as the row mapper. Each measure is independently
 * absent because coverage is uneven: Yahoo only retains ~730 days of intraday
 * history, so an older event can have session-family readings with no
 * `INTRADAY_60M` reading at all — see spec §3.
 */
export interface ReactionObservation {
  eventId: string;
  title: string;
  /** Release instant, ISO 8601 UTC. */
  at: string;
  category: EventCategory;
  symbol: string;
  /** Declared session structure for this instrument — see spec §4.3. */
  sessionBasis: SessionBasis;
  /** Absent key, not null value — a measure that was never measured has no entry. */
  values: Partial<Record<ReactionMeasure, number>>;
}

export interface MeasureStats {
  measure: ReactionMeasure;
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
  /** Declared session structure for this instrument — see spec §4.3. */
  sessionBasis: SessionBasis;
  horizons: Record<ReactionMeasure, MeasureStats | null>;
  /** Distinct events contributing at least one measured measure. */
  events: number;
}

export interface CategoryProfile {
  category: EventCategory;
  /** Distinct events with at least one measured move in any measure. */
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

/**
 * Aggregates one measure's tagged values into a statistics row.
 *
 * `assertSingleMeasure` is the hard pooling guard spec §7.2 requires: every
 * value here is tagged with the measure it was read from, and this throws
 * rather than silently averaging if the tags disagree with `measure` or with
 * each other. A caller that reaches the throw has already lost the measure
 * tag on its values somewhere upstream — the bug this exists to catch cannot
 * be caught by a type check, because the accumulation that would introduce it
 * type-checks fine.
 */
function statsFor(
  measure: ReactionMeasure,
  tagged: readonly TaggedValue[],
): MeasureStats | null {
  if (tagged.length === 0) return null;
  const actual = assertSingleMeasure(tagged);
  if (actual !== null && actual !== measure) {
    throw new Error(
      `statsFor(${measure}) received values tagged ${actual} — refusing to pool measures.`,
    );
  }
  const values = tagged.map((t) => t.value);
  return {
    measure,
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

/**
 * Aggregate observations into per-asset, per-measure statistics.
 *
 * Each measure is summarised over its own observations only, accumulated into
 * a measure-tagged bucket so a value can never end up in the wrong measure's
 * statistics — see {@link statsFor}. Borrowing a `SESSION_PLUS_5` reading to
 * stand in for a missing `RELEASE_SESSION` reading would put two different
 * financial questions in the same average, which is the failure the
 * one-fixed-measure rule in `analyzeCategory` already guards against.
 */
export function profileObservations(
  observations: readonly ReactionObservation[],
  category: EventCategory,
): CategoryProfile {
  const inCategory = observations.filter((o) => o.category === category);

  const bySymbol = new Map<
    string,
    {
      sessionBasis: SessionBasis;
      values: Record<ReactionMeasure, TaggedValue[]>;
      events: Set<string>;
    }
  >();
  const measuredEvents = new Set<string>();

  for (const observation of inCategory) {
    let entry = bySymbol.get(observation.symbol);
    if (!entry) {
      entry = {
        sessionBasis: observation.sessionBasis,
        values: {
          INTRADAY_60M: [],
          RELEASE_SESSION: [],
          SESSION_PLUS_1: [],
          SESSION_PLUS_5: [],
        },
        events: new Set(),
      };
      bySymbol.set(observation.symbol, entry);
    }
    let contributed = false;
    for (const measure of REACTION_MEASURES) {
      const value = observation.values[measure];
      if (value === undefined || value === null || !Number.isFinite(value)) {
        continue;
      }
      entry.values[measure].push({ measure, value });
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
      sessionBasis: entry.sessionBasis,
      events: entry.events.size,
      horizons: {
        INTRADAY_60M: statsFor("INTRADAY_60M", entry.values.INTRADAY_60M),
        RELEASE_SESSION: statsFor("RELEASE_SESSION", entry.values.RELEASE_SESSION),
        SESSION_PLUS_1: statsFor("SESSION_PLUS_1", entry.values.SESSION_PLUS_1),
        SESSION_PLUS_5: statsFor("SESSION_PLUS_5", entry.values.SESSION_PLUS_5),
      },
    });
  }

  // Rank by the size of the typical headline-measure move, the measure the
  // rest of the app headlines. Assets with no RELEASE_SESSION coverage sort
  // last rather than being promoted by a larger reading at another measure.
  assets.sort((a, b) => {
    const am = a.horizons[HEADLINE_MEASURE];
    const bm = b.horizons[HEADLINE_MEASURE];
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
  measure: ReactionMeasure,
): DistributionPoint[] {
  const points: DistributionPoint[] = [];
  for (const observation of observations) {
    if (observation.category !== category) continue;
    if (observation.symbol !== symbol) continue;
    const value = observation.values[measure];
    if (value === undefined || value === null || !Number.isFinite(value)) {
      continue;
    }
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
  measure: ReactionMeasure;
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
  measure: ReactionMeasure;
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
  { symbol, measure, selectedEventId = null }: SummarizeDistributionOptions,
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
    measure,
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
