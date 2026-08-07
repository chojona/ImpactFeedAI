import type {
  AssetReaction,
  Direction,
  EventCategory,
  NewsEvent,
} from "@/types/events";

export interface AssetPattern {
  symbol: string;
  avgPercentChange: number;
  direction: Direction;
  winRate: number;
  eventCount: number;
}

export interface CategoryPattern {
  category: EventCategory;
  avgReactions: AssetPattern[];
  mostConsistentAsset: string | null;
  biggestMover: string | null;
  sampleSize: number;
  events: NewsEvent[];
}

export function analyzeCategory(
  allEvents: NewsEvent[],
  category: EventCategory,
): CategoryPattern {
  const events = allEvents.filter((e) => e.category === category);

  const bySymbol = new Map<string, AssetReaction[]>();
  for (const e of events) {
    for (const a of e.assets) {
      const list = bySymbol.get(a.symbol);
      if (list) list.push(a);
      else bySymbol.set(a.symbol, [a]);
    }
  }

  const avgReactions: AssetPattern[] = [];
  for (const [symbol, reactions] of bySymbol) {
    const sum = reactions.reduce((acc, r) => acc + r.percentChange, 0);
    const avg = sum / reactions.length;
    const direction: Direction = avg > 0 ? "UP" : avg < 0 ? "DOWN" : "FLAT";
    const matches = reactions.filter((r) => r.direction === direction).length;
    const winRate = matches / reactions.length;
    avgReactions.push({
      symbol,
      avgPercentChange: avg,
      direction,
      winRate,
      eventCount: reactions.length,
    });
  }

  avgReactions.sort(
    (a, b) => Math.abs(b.avgPercentChange) - Math.abs(a.avgPercentChange),
  );

  const biggestMover = avgReactions[0]?.symbol ?? null;

  let mostConsistent: AssetPattern | null = null;
  for (const a of avgReactions) {
    if (a.eventCount < 2) continue;
    if (
      !mostConsistent ||
      a.winRate > mostConsistent.winRate ||
      (a.winRate === mostConsistent.winRate &&
        a.eventCount > mostConsistent.eventCount)
    ) {
      mostConsistent = a;
    }
  }
  if (!mostConsistent && avgReactions.length > 0) {
    mostConsistent = avgReactions.reduce((best, cur) =>
      cur.winRate > best.winRate ? cur : best,
    );
  }

  return {
    category,
    avgReactions,
    mostConsistentAsset: mostConsistent?.symbol ?? null,
    biggestMover,
    sampleSize: events.length,
    events,
  };
}
