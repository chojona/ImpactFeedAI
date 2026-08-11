import type {
  Direction,
  EventCategory,
  NewsEvent,
} from "@/types/events";
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
