/**
 * Look-ahead-safe anchor and endpoint selection over 1-minute bars.
 *
 * A bar's close is only known once its minute has elapsed, so the anchor is
 * the close of the last bar with `openAt + 60s <= releaseAt`. The bar that
 * contains the release instant is never an anchor. The endpoint is the open of
 * the first bar at or after the target instant, matching the intraday
 * convention in `src/services/events/reactionMeasurement.ts`.
 *
 * Callers pass bars of a single contract. Missing evidence returns null; the
 * helpers never reach past an unusable or ambiguous bar to a staler one.
 */
import type { NqMinuteBar, NqPricePoint } from "./types";

const BAR_MS = 60_000;

const usablePrice = (value: number): boolean =>
  Number.isFinite(value) && value > 0;

const assertInstant = (instant: Date, label: string): number => {
  const ms = instant instanceof Date ? instant.getTime() : Number.NaN;
  if (!Number.isFinite(ms)) {
    throw new TypeError(`${label} must be a finite Date`);
  }
  return ms;
};

/**
 * Pick the bar maximising (or minimising) `openAt` among `eligible` ones.
 * Two bars on the winning minute are ambiguous and yield null.
 */
const pickUnique = (
  bars: readonly NqMinuteBar[],
  eligible: (openMs: number) => boolean,
  better: (candidate: number, best: number) => boolean,
): NqMinuteBar | null => {
  let best: NqMinuteBar | null = null;
  let tied = false;
  for (const bar of bars) {
    const openMs = bar.openAt.getTime();
    if (!Number.isFinite(openMs) || !eligible(openMs)) continue;
    if (best === null || better(openMs, best.openAt.getTime())) {
      best = bar;
      tied = false;
    } else if (openMs === best.openAt.getTime()) {
      tied = true;
    }
  }
  return tied ? null : best;
};

export function selectPreReleaseAnchor(
  bars: readonly NqMinuteBar[],
  releaseAt: Date,
): NqPricePoint | null {
  const releaseMs = assertInstant(releaseAt, "releaseAt");
  const bar = pickUnique(
    bars,
    (openMs) => openMs + BAR_MS <= releaseMs,
    (candidate, best) => candidate > best,
  );
  if (bar === null || !usablePrice(bar.close)) return null;
  return { role: "anchor", bar, price: bar.close, priceField: "close" };
}

export function selectEndpointAtOrAfter(
  bars: readonly NqMinuteBar[],
  targetAt: Date,
): NqPricePoint | null {
  const targetMs = assertInstant(targetAt, "targetAt");
  const bar = pickUnique(
    bars,
    (openMs) => openMs >= targetMs,
    (candidate, best) => candidate < best,
  );
  if (bar === null || !usablePrice(bar.open)) return null;
  return { role: "endpoint", bar, price: bar.open, priceField: "open" };
}
