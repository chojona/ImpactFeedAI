import { describe, expect, it } from "vitest";

import {
  buildReactionPlot,
  halfDomainFor,
  plotSlots,
  polylinePoints,
} from "@/services/events/reactionChart";
import type { AssetReaction } from "@/types/events";

/**
 * Geometry is where an unmeasured window is most likely to become a visible
 * point on the zero line. These tests exist to keep that from happening
 * silently: a plotted marker is a claim that a measurement was taken.
 */

const asset = (
  symbol: string,
  moves: Partial<Pick<AssetReaction, "pct1h" | "pct1d" | "pct1w">>,
): AssetReaction => ({
  symbol,
  name: symbol,
  assetType: "INDEX",
  priceAtEvent: 100,
  price1h: null,
  price1d: null,
  price1w: null,
  pct1h: moves.pct1h ?? null,
  pct1d: moves.pct1d ?? null,
  pct1w: moves.pct1w ?? null,
  anchorAt: "2025-05-13T13:30:00.000Z",
  calculationVersion: 2,
  primaryWindow: moves.pct1d === undefined ? null : "1d",
  percentChange: moves.pct1d ?? null,
  direction: null,
});

describe("plotSlots", () => {
  it("always exposes all four positions so a gap stays visible", () => {
    expect(plotSlots().map((s) => s.label)).toEqual(["T", "+1H", "+1D", "+1W"]);
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
  it("emits no point for an unmeasured window", () => {
    // Regression guard: a null 1h reading plotted at y=0 is pixel-identical to
    // a measured flat hour, which is the core integrity rule of this product.
    const plot = buildReactionPlot({
      focus: asset("SPY", { pct1d: 1, pct1w: 2 }),
    });
    expect(plot.focus?.points.map((p) => p.label)).toEqual([
      "T",
      "+1D",
      "+1W",
    ]);
    expect(plot.missingWindows).toEqual(["1h"]);
  });

  it("marks the anchor as unmeasured — it is zero by definition", () => {
    const plot = buildReactionPlot({ focus: asset("SPY", { pct1d: 1 }) });
    const anchor = plot.focus?.points[0];
    expect(anchor?.window).toBeNull();
    expect(anchor?.value).toBe(0);
    expect(anchor?.measured).toBe(false);
  });

  it("keeps the zero line centred so the sign is readable before the numbers", () => {
    const plot = buildReactionPlot({ focus: asset("SPY", { pct1d: 3 }) });
    expect(plot.zeroYPct).toBe(50);
  });

  it("puts a positive move above the zero line and a negative move below", () => {
    const up = buildReactionPlot({ focus: asset("SPY", { pct1d: 2 }) });
    const down = buildReactionPlot({ focus: asset("SPY", { pct1d: -2 }) });
    expect(up.focus?.points[1].yPct).toBeLessThan(50);
    expect(down.focus?.points[1].yPct).toBeGreaterThan(50);
  });

  it("scales the context series on the focus series' domain", () => {
    // Two lines drawn on two scales would misrepresent every comparison the
    // chart exists to support.
    const plot = buildReactionPlot({
      focus: asset("SPY", { pct1d: 1 }),
      context: [asset("QQQ", { pct1d: 4 })],
    });
    expect(plot.halfDomain).toBeCloseTo(5, 6);
    expect(plot.context).toHaveLength(1);
    expect(plot.context[0].points[1].yPct).toBeCloseTo(
      plot.focus!.points[1].yPct - (3 / 5) * 50,
      6,
    );
  });

  it("excludes the focus asset from its own context", () => {
    const spy = asset("SPY", { pct1d: 1 });
    const plot = buildReactionPlot({ focus: spy, context: [spy] });
    expect(plot.context).toHaveLength(0);
  });

  it("drops a context series that has nothing but the anchor", () => {
    const plot = buildReactionPlot({
      focus: asset("SPY", { pct1d: 1 }),
      context: [asset("TLT", {})],
    });
    expect(plot.context).toHaveLength(0);
  });

  it("reports every window as missing when there is no focus asset", () => {
    const plot = buildReactionPlot({ focus: null });
    expect(plot.focus).toBeNull();
    expect(plot.missingWindows).toEqual(["1h", "1d", "1w"]);
  });
});

describe("polylinePoints", () => {
  it("joins the plotted points in order", () => {
    const plot = buildReactionPlot({
      focus: asset("SPY", { pct1h: 1, pct1d: 2 }),
    });
    const points = polylinePoints(plot.focus!.points);
    expect(points.split(" ")).toHaveLength(3);
  });
});
