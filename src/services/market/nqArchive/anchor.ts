/**
 * Look-ahead-safe anchor and endpoint selection over 1-minute bars.
 *
 * A bar's close is only known once its minute has elapsed, so the anchor is
 * the close of the last bar with `openAt + 60s <= releaseAt`. The bar that
 * contains the release instant is never an anchor. The endpoint is the open of
 * the first bar at or after the target instant, matching the intraday
 * convention in `src/services/events/reactionMeasurement.ts`.
 *
 * Freshness is deliberately the most conservative rule available: the anchor
 * must be the last fully elapsed minute before the release (its close less
 * than {@link ANCHOR_MAX_AGE_MS} old), and the endpoint must open less than
 * {@link ENDPOINT_MAX_SLIP_MS} after the target. A gap, the daily break or a
 * weekend between the bar and the instant therefore yields null rather than a
 * stale price. Extraction additionally requires the anchor to carry the
 * release session's trading date.
 *
 * Callers pass bars of a single contract. Missing evidence returns null; the
 * helpers never reach past an unusable or ambiguous bar to a staler one.
 */
import type { NqMinuteBar, NqPricePoint } from "./types";

const BAR_MS = 60_000;
/** Exclusive bound on `releaseAt - (anchor.openAt + 60s)`. */
export const ANCHOR_MAX_AGE_MS = 60_000;
/** Exclusive bound on `endpoint.openAt - targetAt`. */
export const ENDPOINT_MAX_SLIP_MS = 60_000;

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
  if (releaseMs - (bar.openAt.getTime() + BAR_MS) >= ANCHOR_MAX_AGE_MS) {
    return null;
  }
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
  if (bar.openAt.getTime() - targetMs >= ENDPOINT_MAX_SLIP_MS) return null;
  return { role: "endpoint", bar, price: bar.open, priceField: "open" };
}
