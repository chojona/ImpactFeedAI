import type { AssetReactionRow, PriceSnapshot } from "./types";

const pct = (anchor: number, later: number | null): number | null => {
  if (later === null) return null;
  return Math.round(((later - anchor) / anchor) * 1e4) / 1e2; // 4-dp percent → 2-dp display
};

export function buildAssetReaction(
  assetSymbol: string,
  snapshot: PriceSnapshot,
): AssetReactionRow {
  return {
    assetSymbol,
    priceAtEvent: snapshot.priceAtEvent,
    price1h: snapshot.price1h,
    price1d: snapshot.price1d,
    price1w: snapshot.price1w,
    pctChange1h: pct(snapshot.priceAtEvent, snapshot.price1h),
    pctChange1d: pct(snapshot.priceAtEvent, snapshot.price1d),
    pctChange1w: pct(snapshot.priceAtEvent, snapshot.price1w),
  };
}

export function computeSurprise(
  actual: number | null,
  expected: number | null,
): number | null {
  if (actual === null || expected === null) return null;
  return Math.round((actual - expected) * 1e4) / 1e4;
}