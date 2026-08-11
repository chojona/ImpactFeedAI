import type { AssetReactionRow, PriceSnapshot } from "./types";
import { CURRENT_REACTION_CALCULATION_VERSION } from "@/services/events/timing";

/**
 * Percent change from the anchor, rounded to 2 decimal places.
 *
 * Returns null — never 0 — when the later price is unavailable. A missing
 * window and a flat market are different facts, and only one of them belongs in
 * an average.
 */
const pct = (anchor: number, later: number | null): number | null => {
  if (later === null) return null;
  if (!Number.isFinite(anchor) || !Number.isFinite(later) || anchor === 0) {
    return null;
  }
  // Persist calculation precision; components round only when they display it.
  return ((later - anchor) / anchor) * 100;
};

export function buildAssetReaction(
  assetSymbol: string,
  snapshot: PriceSnapshot,
): AssetReactionRow {
  return {
    assetSymbol,
    anchorAt: snapshot.anchorAt,
    calculationVersion: CURRENT_REACTION_CALCULATION_VERSION,
    priceAtEvent: snapshot.priceAtEvent,
    price1h: snapshot.price1h,
    price1d: snapshot.price1d,
    price1w: snapshot.price1w,
    pctChange1h: pct(snapshot.priceAtEvent, snapshot.price1h),
    pctChange1d: pct(snapshot.priceAtEvent, snapshot.price1d),
    pctChange1w: pct(snapshot.priceAtEvent, snapshot.price1w),
  };
}
