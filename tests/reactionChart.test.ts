import { describe, expect, it } from "vitest";

import {
  buildReactionPlot,
  halfDomainFor,
  plotSlots,
  polylinePoints,
} from "@/services/events/reactionChart";
import type { AssetReaction, MeasuredMove, ReactionMeasure } from "@/types/events";

/**
 * Geometry is where an unmeasured measure is most likely to become a visible
 * point on the zero line. These tests exist to keep that from happening
 * silently: a plotted marker is a claim that a measurement was taken.
 */

const move = (
  measure: ReactionMeasure,
  pctChange: number,
  endpointPrice = 101,
): MeasuredMove => ({
  measure,
  pctChange,
  anchorPrice: 100,
  anchorBarAt: "2025-05-12T13:30:00.000Z",
  anchorSessionDay: "2025-05-12",
  endpointPrice,
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

describe("plotSlots", () => {
  it("always exposes all four measure positions so a gap stays visible", () => {
    expect(plotSlots().map((s) => s.label)).toEqual([
      "First hour",
      "Release session",
      "Next session",
      "5 sessions",
    ]);
  });

  it("insets the first and last slot so markers are not clipped", () => {
    const slots = plotSlots();
    expect(slots[0].xPct).toBeGreaterThan(0);
    expect(slots[slots.length - 1].xPct).toBeLessThan(100);
  });
});

describe("halfDomainFor", () => {
  it("floors the domain so a market that barely moved is not magnified", () => {
    expect(halfDomainFor([0.001])).toBe(0.25);
  });

  it("pads above the largest absolute move", () => {
    expect(halfDomainFor([2, -4])).toBeCloseTo(5, 6);
  });

  it("ignores non-finite values rather than producing NaN geometry", () => {
    expect(halfDomainFor([Number.NaN, Number.POSITIVE_INFINITY])).toBe(0.25);
  });
});

describe("buildReactionPlot", () => {
  it("emits no point for an unmeasured measure", () => {
    // Regression guard: a null INTRADAY_60M reading plotted at y=0 is
    // pixel-identical to a measured flat hour, which is the core integrity
    // rule of this product.
    const plot = buildReactionPlot({
      focus: asset("SPY", { RELEASE_SESSION: 1, SESSION_PLUS_5: 2 }),
    });
    expect(plot.focus?.points.map((p) => p.label)).toEqual([
      "Release session",
      "5 sessions",
    ]);
    expect(plot.missingMeasures).toEqual(["INTRADAY_60M", "SESSION_PLUS_1"]);
  });

  it("keeps the zero line centred so the sign is readable before the numbers", () => {
    const plot = buildReactionPlot({ focus: asset("SPY", { RELEASE_SESSION: 3 }) });
    expect(plot.zeroYPct).toBe(50);
  });

  it("puts a positive move above the zero line and a negative move below", () => {
    const up = buildReactionPlot({ focus: asset("SPY", { RELEASE_SESSION: 2 }) });
    const down = buildReactionPlot({ focus: asset("SPY", { RELEASE_SESSION: -2 }) });
    expect(up.focus?.points[0].yPct).toBeLessThan(50);
    expect(down.focus?.points[0].yPct).toBeGreaterThan(50);
  });

  it("scales the context series on the focus series' domain", () => {
    // Two lines drawn on two scales would misrepresent every comparison the
    // chart exists to support.
    const plot = buildReactionPlot({
      focus: asset("SPY", { RELEASE_SESSION: 1 }),
      context: [asset("QQQ", { INTRADAY_60M: 4, RELEASE_SESSION: 4 })],
    });
    expect(plot.halfDomain).toBeCloseTo(5, 6);
    expect(plot.context).toHaveLength(1);
  });

  it("excludes the focus asset from its own context", () => {
    const spy = asset("SPY", { RELEASE_SESSION: 1 });
    const plot = buildReactionPlot({ focus: spy, context: [spy] });
    expect(plot.context).toHaveLength(0);
  });

  it("drops a context series with fewer than two points", () => {
    const plot = buildReactionPlot({
      focus: asset("SPY", { RELEASE_SESSION: 1 }),
      context: [asset("TLT", { RELEASE_SESSION: 1 })],
    });
    // A single-point context series draws nothing useful.
    expect(plot.context).toHaveLength(0);
  });

  it("reports every measure as missing when there is no focus asset", () => {
    const plot = buildReactionPlot({ focus: null });
    expect(plot.focus).toBeNull();
    expect(plot.missingMeasures).toEqual([
      "INTRADAY_60M",
      "RELEASE_SESSION",
      "SESSION_PLUS_1",
      "SESSION_PLUS_5",
    ]);
  });
});

describe("polylinePoints", () => {
  it("joins the plotted points in order", () => {
    const plot = buildReactionPlot({
      focus: asset("SPY", { INTRADAY_60M: 1, RELEASE_SESSION: 2 }),
    });
    const points = polylinePoints(plot.focus!.points);
    expect(points.split(" ")).toHaveLength(2);
  });
});
