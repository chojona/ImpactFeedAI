import { describe, expect, it } from "vitest";

import {
  assertSingleMeasure,
  formatPercentChange,
  measuredMeasures,
  measurementSeries,
  rankByMeasure,
  strongestAtMeasure,
  unmeasuredMeasures,
} from "@/services/events/reactionView";
import type { AssetReaction, MeasuredMove, ReactionMeasure } from "@/types/events";

const move = (measure: ReactionMeasure, pctChange: number): MeasuredMove => ({
  measure,
  pctChange,
  anchorPrice: 100,
  anchorBarAt: "2025-05-12T13:30:00.000Z",
  anchorSessionDay: "2025-05-12",
  endpointPrice: 100 + pctChange,
  endpointBarAt: "2025-05-13T13:30:00.000Z",
  endpointSessionDay: "2025-05-13",
  releaseSessionDay: "2025-05-13",
  anchorKind: measure === "INTRADAY_60M" ? "PRE_RELEASE_INTRADAY_BAR" : "PRIOR_SESSION_CLOSE",
  priceBasis: "SPLIT_ADJUSTED",
});

const asset = (
  symbol: string,
  moves: Partial<Record<ReactionMeasure, number>>,
): AssetReaction => {
  const measures: Partial<Record<ReactionMeasure, MeasuredMove>> = {};
  for (const [measure, pct] of Object.entries(moves) as [ReactionMeasure, number][]) {
    measures[measure] = move(measure, pct);
  }
  const headline = measures.RELEASE_SESSION ?? null;
  return {
    symbol,
    name: symbol,
    assetType: "INDEX",
    sessionBasis: "US_EQUITY_RTH",
    measures,
    headlineMeasure: headline === null ? null : "RELEASE_SESSION",
    percentChange: headline?.pctChange ?? null,
    direction: null,
  };
};

describe("rankByMeasure", () => {
  it("separates unmeasured assets instead of ranking them at zero", () => {
    // A zero-length bar and a measured 0.00% are the same picture, so an
    // unmeasured asset must never enter the ranked set.
    const ranking = rankByMeasure(
      [
        asset("SPY", { RELEASE_SESSION: 0.4 }),
        asset("TLT", {}),
        asset("QQQ", { RELEASE_SESSION: -1.2 }),
      ],
      "RELEASE_SESSION",
    );
    expect(ranking.measured.map((r) => r.asset.symbol)).toEqual(["QQQ", "SPY"]);
    expect(ranking.unmeasured.map((a) => a.symbol)).toEqual(["TLT"]);
  });

  it("ranks by absolute move, not by signed move", () => {
    const ranking = rankByMeasure(
      [asset("SPY", { RELEASE_SESSION: 0.5 }), asset("QQQ", { RELEASE_SESSION: -3 })],
      "RELEASE_SESSION",
    );
    expect(ranking.measured[0].asset.symbol).toBe("QQQ");
  });

  it("reports a null scale when nothing was measured", () => {
    expect(rankByMeasure([asset("SPY", {})], "RELEASE_SESSION").maxAbs).toBeNull();
  });

  it("ranks each measure independently", () => {
    const assets = [
      asset("SPY", { INTRADAY_60M: 2, RELEASE_SESSION: 0.1 }),
      asset("QQQ", { INTRADAY_60M: 0.1, RELEASE_SESSION: 2 }),
    ];
    expect(rankByMeasure(assets, "INTRADAY_60M").measured[0].asset.symbol).toBe("SPY");
    expect(rankByMeasure(assets, "RELEASE_SESSION").measured[0].asset.symbol).toBe("QQQ");
  });

  it("keeps a genuine zero in the measured set", () => {
    const ranking = rankByMeasure([asset("SPY", { RELEASE_SESSION: 0 })], "RELEASE_SESSION");
    expect(ranking.measured).toHaveLength(1);
    expect(ranking.unmeasured).toHaveLength(0);
  });
});

describe("strongestAtMeasure", () => {
  it("is null when no asset has a reading at that measure", () => {
    expect(
      strongestAtMeasure([asset("SPY", { SESSION_PLUS_5: 3 })], "INTRADAY_60M"),
    ).toBeNull();
  });
});

describe("measured and unmeasured measures", () => {
  it("partitions the four measures", () => {
    const a = asset("SPY", { INTRADAY_60M: 1, SESSION_PLUS_5: -1 });
    expect(measuredMeasures(a)).toEqual(["INTRADAY_60M", "SESSION_PLUS_5"]);
    expect(unmeasuredMeasures(a)).toEqual(["RELEASE_SESSION", "SESSION_PLUS_1"]);
  });
});

describe("measurementSeries", () => {
  it("emits only the measures present, in canonical order, without interpolating", () => {
    const series = measurementSeries(asset("SPY", { INTRADAY_60M: 0.2, SESSION_PLUS_5: 1.7 }));
    expect(series.map((p) => p.label)).toEqual(["First hour", "5 sessions"]);
    expect(series.map((p) => p.value)).toEqual([0.2, 1.7]);
  });

  it("returns nothing when no measure was measured", () => {
    expect(measurementSeries(asset("SPY", {}))).toEqual([]);
  });
});

describe("assertSingleMeasure", () => {
  it("returns the shared measure when every value agrees", () => {
    expect(
      assertSingleMeasure([
        { measure: "RELEASE_SESSION", value: 1 },
        { measure: "RELEASE_SESSION", value: -2 },
      ]),
    ).toBe("RELEASE_SESSION");
  });

  it("returns null for an empty input rather than throwing", () => {
    expect(assertSingleMeasure([])).toBeNull();
  });

  it("throws when values are drawn from more than one measure", () => {
    expect(() =>
      assertSingleMeasure([
        { measure: "RELEASE_SESSION", value: 1 },
        { measure: "SESSION_PLUS_1", value: 2 },
      ]),
    ).toThrow(/more than one measure/);
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
