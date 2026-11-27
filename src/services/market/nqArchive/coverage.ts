/**
 * Coverage reporting for an extracted event window.
 *
 * Completeness is measured against the entire requested UTC minute grid
 * (inclusive), including leading and trailing gaps and empty windows. Missing
 * minutes are listed explicitly and never imputed.
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

  const expectedOpenAts = contiguousUtcMinuteOpens(
    utcMinuteOpen(windowStart),
    utcMinuteOpen(windowEnd),
  );
  const missingOpenAts = expectedOpenAts.filter(
    (open) => !seen.has(open.getTime()),
  );

  return {
    windowStart: utcMinuteOpen(windowStart),
    windowEnd: utcMinuteOpen(windowEnd),
    expectedBars: expectedOpenAts.length,
    observedBars: sorted.length,
    expectedOpenAts,
    observedOpenAts,
    missingOpenAts,
    complete: expectedOpenAts.length > 0 && missingOpenAts.length === 0,
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
