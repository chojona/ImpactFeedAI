/**
 * Coverage reporting for an extracted event window.
 *
 * Completeness is measured against the session-aware minute grid of the
 * requested window (inclusive): every window minute inside Globex hours,
 * including leading and trailing gaps and empty windows. Missing minutes are
 * listed explicitly and never imputed.
 */
import { isGlobexActiveMinute } from "./sessionGrid";
import { contiguousUtcMinuteOpens, utcMinuteOpen } from "./tradingDate";
import type { NqCoverageReport, NqMinuteBar } from "./types";

const uniqueSorted = (times: Iterable<number>): Date[] =>
  [...new Set(times)].sort((a, b) => a - b).map((t) => new Date(t));

export function buildCoverageReport(args: {
  windowStart: Date;
  windowEnd: Date;
  selectedContract: string;
  bars: readonly NqMinuteBar[];
  isExpectedMinute?: (openAt: Date) => boolean;
}): NqCoverageReport {
  const { windowStart, windowEnd, selectedContract, bars } = args;
  const isExpectedMinute = args.isExpectedMinute ?? isGlobexActiveMinute;

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
  const seenCount = new Map<number, number>();
  for (const open of observedOpenAts) {
    seenCount.set(open.getTime(), (seenCount.get(open.getTime()) ?? 0) + 1);
  }

  const grid = contiguousUtcMinuteOpens(
    utcMinuteOpen(windowStart),
    utcMinuteOpen(windowEnd),
  );
  const expectedOpenAts = grid.filter((open) => isExpectedMinute(open));
  const expectedSet = new Set(expectedOpenAts.map((d) => d.getTime()));
  const missingOpenAts = expectedOpenAts.filter(
    (open) => !seenCount.has(open.getTime()),
  );
  const duplicateOpenAts = uniqueSorted(
    [...seenCount].filter(([, count]) => count > 1).map(([t]) => t),
  );
  const unexpectedOpenAts = uniqueSorted(
    [...seenCount.keys()].filter((t) => !expectedSet.has(t)),
  );

  return {
    windowStart: utcMinuteOpen(windowStart),
    windowEnd: utcMinuteOpen(windowEnd),
    expectedBars: expectedOpenAts.length,
    observedBars: sorted.length,
    expectedOpenAts,
    excludedClosedMinutes: grid.length - expectedOpenAts.length,
    observedOpenAts,
    missingOpenAts,
    unexpectedOpenAts,
    duplicateOpenAts,
    complete:
      expectedOpenAts.length > 0 &&
      missingOpenAts.length === 0 &&
      duplicateOpenAts.length === 0,
    foreignContractBars,
  };
}

/**
 * Align a release instant to the bar-open grid: the minute open that contains
 * `releaseAt` is `floor(releaseAt)` in UTC. A bar stamped at that open is the
 * first minute that can include the release print, so it must never serve as
 * a pre-release anchor (see `selectPreReleaseAnchor`).
 */
export function releaseMinuteOpen(releaseAt: Date): Date {
  return utcMinuteOpen(releaseAt);
}
