/**
 * Coverage reporting for an extracted event window.
 *
 * Missing minutes between the first and last observed bar are listed explicitly.
 * They are never filled with fabricated OHLCV.
 */
import { contiguousUtcMinuteOpens, utcMinuteOpen } from "./tradingDate";
import type { NqCoverageReport, NqMinuteBar } from "./types";

export function buildCoverageReport(args: {
  windowStart: Date;
  windowEnd: Date;
  selectedContract: string;
  bars: readonly NqMinuteBar[];
}): NqCoverageReport {
  const { windowStart, windowEnd, selectedContract, bars } = args;

  let foreignContractBars = 0;
  const selected: NqMinuteBar[] = [];
  for (const bar of bars) {
    if (bar.contract !== selectedContract) {
      foreignContractBars += 1;
      continue;
    }
    selected.push(bar);
  }

  const sorted = [...selected].sort(
    (a, b) => a.openAt.getTime() - b.openAt.getTime(),
  );
  const observedOpenAts = sorted.map((bar) => utcMinuteOpen(bar.openAt));
  const seen = new Set(observedOpenAts.map((d) => d.getTime()));

  let missingOpenAts: Date[] = [];
  if (observedOpenAts.length >= 2) {
    const grid = contiguousUtcMinuteOpens(
      observedOpenAts[0]!,
      observedOpenAts[observedOpenAts.length - 1]!,
    );
    missingOpenAts = grid.filter((open) => !seen.has(open.getTime()));
  }

  return {
    windowStart,
    windowEnd,
    observedBars: sorted.length,
    observedOpenAts,
    missingOpenAts,
    foreignContractBars,
  };
}

/**
 * Align a release instant to the bar-open grid: the minute open that contains
 * `releaseAt` is `floor(releaseAt)` in UTC. A bar stamped at that open is the
 * first minute that can include the release print.
 */
export function releaseMinuteOpen(releaseAt: Date): Date {
  return utcMinuteOpen(releaseAt);
}
