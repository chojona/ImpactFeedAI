import { describe, expect, it } from "vitest";

import {
  formatPercentChange,
  measuredWindows,
  rankByWindow,
  reactionPath,
  strongestAtWindow,
  unmeasuredWindows,
} from "@/services/events/reactionView";
import type { AssetReaction } from "@/types/events";

const asset = (
  symbol: string,
  moves: Partial<Pick<AssetReaction, "pct1h" | "pct1d" | "pct1w">>,
): AssetReaction => ({
  symbol,
  name: symbol,
  assetType: "INDEX",
  priceAtEvent: 100,
  price1h: null,
  price1d: moves.pct1d === undefined ? null : 101,
  price1w: null,
  pct1h: moves.pct1h ?? null,
  pct1d: moves.pct1d ?? null,
  pct1w: moves.pct1w ?? null,
  anchorAt: null,
  calculationVersion: 2,
  primaryWindow: moves.pct1d === undefined ? null : "1d",
  percentChange: moves.pct1d ?? null,
  direction: null,
});

describe("rankByWindow", () => {
  it("separates unmeasured assets instead of ranking them at zero", () => {
    // A zero-length bar and a measured 0.00% are the same picture, so an
    // unmeasured asset must never enter the ranked set.
    const ranking = rankByWindow(
      [asset("SPY", { pct1d: 0.4 }), asset("TLT", {}), asset("QQQ", { pct1d: -1.2 })],
      "1d",
    );
    expect(ranking.measured.map((r) => r.asset.symbol)).toEqual(["QQQ", "SPY"]);
    expect(ranking.unmeasured.map((a) => a.symbol)).toEqual(["TLT"]);
  });

  it("ranks by absolute move, not by signed move", () => {
    const ranking = rankByWindow(
      [asset("SPY", { pct1d: 0.5 }), asset("QQQ", { pct1d: -3 })],
      "1d",
    );
    expect(ranking.measured[0].asset.symbol).toBe("QQQ");
  });

  it("reports a null scale when nothing was measured", () => {
    expect(rankByWindow([asset("SPY", {})], "1d").maxAbs).toBeNull();
  });

  it("ranks each window independently", () => {
    const assets = [
      asset("SPY", { pct1h: 2, pct1d: 0.1 }),
      asset("QQQ", { pct1h: 0.1, pct1d: 2 }),
    ];
    expect(rankByWindow(assets, "1h").measured[0].asset.symbol).toBe("SPY");
    expect(rankByWindow(assets, "1d").measured[0].asset.symbol).toBe("QQQ");
  });

  it("keeps a genuine zero in the measured set", () => {
    const ranking = rankByWindow([asset("SPY", { pct1d: 0 })], "1d");
    expect(ranking.measured).toHaveLength(1);
    expect(ranking.unmeasured).toHaveLength(0);
  });
});

describe("strongestAtWindow", () => {
  it("is null when no asset has a reading at that window", () => {
    expect(strongestAtWindow([asset("SPY", { pct1w: 3 })], "1h")).toBeNull();
  });
});

describe("measured and unmeasured windows", () => {
  it("partitions the three windows", () => {
    const a = asset("SPY", { pct1h: 1, pct1w: -1 });
    expect(measuredWindows(a)).toEqual(["1h", "1w"]);
    expect(unmeasuredWindows(a)).toEqual(["1d"]);
  });
});

describe("reactionPath", () => {
  it("starts at the anchor and skips gaps without interpolating", () => {
    const path = reactionPath(asset("SPY", { pct1h: 0.2, pct1w: 1.7 }));
    expect(path.map((p) => p.label)).toEqual(["T", "1H", "1W"]);
    expect(path[0].value).toBe(0);
    expect(path[0].window).toBeNull();
  });
});

describe("formatPercentChange", () => {
  it("returns null for an unmeasured reading so the caller must decide", () => {
    expect(formatPercentChange(null)).toBeNull();
  });

  it("returns null for a non-finite reading rather than 'NaN%'", () => {
    expect(formatPercentChange(Number.NaN)).toBeNull();
    expect(formatPercentChange(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("signs a positive move and formats a genuine zero", () => {
    expect(formatPercentChange(0.311)).toBe("+0.31%");
    expect(formatPercentChange(-0.211)).toBe("-0.21%");
    expect(formatPercentChange(0)).toBe("0.00%");
  });
});
