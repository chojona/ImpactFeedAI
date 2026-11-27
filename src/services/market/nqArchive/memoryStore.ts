/**
 * In-memory bar store for deterministic unit tests. No I/O.
 */
import type { NqBarStore, NqMinuteBar } from "./types";

export function createMemoryNqBarStore(
  bars: readonly NqMinuteBar[],
): NqBarStore {
  const sorted = [...bars].sort(
    (a, b) => a.openAt.getTime() - b.openAt.getTime(),
  );

  return {
    async queryWithinContract({ contract, startInclusive, endInclusive }) {
      const start = startInclusive.getTime();
      const end = endInclusive.getTime();
      return sorted.filter(
        (bar) =>
          bar.contract === contract &&
          bar.openAt.getTime() >= start &&
          bar.openAt.getTime() <= end,
      );
    },
  };
}

/** Build a contiguous synthetic within-contract grid for tests. */
export function syntheticMinuteBars(args: {
  contract: string;
  tradingDate: string;
  start: Date;
  count: number;
  basePrice?: number;
  skipOpens?: readonly Date[];
}): NqMinuteBar[] {
  const basePrice = args.basePrice ?? 15_000;
  const skip = new Set(
    (args.skipOpens ?? []).map((d) => d.getTime()),
  );
  const bars: NqMinuteBar[] = [];
  for (let i = 0; i < args.count; i += 1) {
    const openAt = new Date(args.start.getTime() + i * 60_000);
    if (skip.has(openAt.getTime())) continue;
    const px = basePrice + i * 0.25;
    bars.push({
      openAt,
      tradingDate: args.tradingDate,
      contract: args.contract,
      open: px,
      high: px + 0.25,
      low: px - 0.25,
      close: px + 0.125,
      volume: 10 + i,
      tsEventNs: BigInt(openAt.getTime()) * BigInt(1_000_000),
    });
  }
  return bars;
}
