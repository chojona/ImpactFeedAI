import { describe, expect, it } from "vitest";

import { analyzeCategory } from "@/services/analytics/patternAnalysis";
import { mapEvent, type EventRow } from "@/services/events/mapEvent";
import { CURRENT_REACTION_CALCULATION_VERSION } from "@/services/events/timing";
import type { NewsEvent } from "@/types/events";

/** Build a mapped event with the given per-symbol one-day moves. */
const event = (
  id: string,
  eventType: EventRow["eventType"],
  moves: Record<string, number | null>,
): NewsEvent =>
  mapEvent({
    id,
    headline: `${id} headline`,
    eventType,
    occurredAt: new Date("2025-05-13T12:30:00Z"),
    releaseAt: new Date("2025-05-13T12:30:00Z"),
    releaseDate: new Date("2025-05-13T00:00:00Z"),
    timingStatus: "VERIFIED",
    timingSource: "Official release calendar",
    sourceUrl: null,
    explanation: null,
    dataReleases: [],
    assetReactions: Object.entries(moves).map(([assetSymbol, pct]) => ({
      assetSymbol,
      priceAtEvent: 100,
      price1h: null,
      price1d: pct === null ? null : 100 + pct,
      price1w: null,
      pctChange1h: null,
      pctChange1d: pct,
      pctChange1w: null,
      anchorAt: new Date("2025-05-13T13:30:00Z"),
      calculationVersion: CURRENT_REACTION_CALCULATION_VERSION,
    })),
  });

describe("analyzeCategory", () => {
  it("averages only measured moves and reports the contributing sample size", () => {
    // Regression: counting an unmeasured reaction as 0.00% dragged every average
    // toward zero in proportion to how patchy the coverage was.
    const events = [
      event("a", "CPI", { SPY: -1.0 }),
      event("b", "CPI", { SPY: -2.0 }),
      event("c", "CPI", { SPY: null }),
    ];
    const pattern = analyzeCategory(events, "INFLATION");
    const spy = pattern.avgReactions.find((a) => a.symbol === "SPY");

    expect(spy!.avgPercentChange).toBeCloseTo(-1.5, 4);
    expect(spy!.eventCount).toBe(2);
  });

  it("never substitutes another horizon for a missing one-day move", () => {
    const measured = event("a", "CPI", { SPY: -2 });
    const weekOnly = event("b", "CPI", { SPY: null });
    weekOnly.assets[0].pct1w = 20;
    weekOnly.assets[0].percentChange = 20;
    weekOnly.assets[0].primaryWindow = "1w";

    const spy = analyzeCategory(
      [measured, weekOnly],
      "INFLATION",
    ).avgReactions.find((asset) => asset.symbol === "SPY");

    expect(spy!.avgPercentChange).toBe(-2);
    expect(spy!.eventCount).toBe(1);
  });

  it("drops non-finite one-day values before averaging", () => {
    const valid = event("a", "CPI", { SPY: 2 });
    const invalid = event("b", "CPI", { SPY: null });
    invalid.assets[0].pct1d = Number.NaN;

    const spy = analyzeCategory(
      [valid, invalid],
      "INFLATION",
    ).avgReactions.find((asset) => asset.symbol === "SPY");

    expect(spy!.avgPercentChange).toBe(2);
    expect(spy!.eventCount).toBe(1);
  });

  it("defensively excludes timing-ineligible and stale-version rows", () => {
    const valid = event("a", "CPI", { SPY: 2 });
    const untrusted = event("b", "CPI", { SPY: 40 });
    untrusted.timing.reactionEligible = false;
    untrusted.timing.ineligibilityReason = "untrusted_status";
    const stale = event("c", "CPI", { SPY: 30 });
    stale.assets[0].calculationVersion = 0;

    const pattern = analyzeCategory(
      [valid, untrusted, stale],
      "INFLATION",
    );
    const spy = pattern.avgReactions.find((asset) => asset.symbol === "SPY");

    expect(spy!.avgPercentChange).toBe(2);
    expect(spy!.eventCount).toBe(1);
    expect(pattern.measuredSampleSize).toBe(1);
  });

  it("separates events in the category from events that contributed data", () => {
    const events = [
      event("a", "CPI", { SPY: -1.0 }),
      event("b", "CPI", { SPY: null }),
      event("c", "CPI", {}),
    ];
    const pattern = analyzeCategory(events, "INFLATION");
    expect(pattern.sampleSize).toBe(3);
    expect(pattern.measuredSampleSize).toBe(1);
  });

  it("filters to the requested category", () => {
    const events = [
      event("a", "CPI", { SPY: -1.0 }),
      event("b", "FED_DECISION", { SPY: 5.0 }),
    ];
    const inflation = analyzeCategory(events, "INFLATION");
    expect(inflation.sampleSize).toBe(1);
    expect(inflation.avgReactions[0].avgPercentChange).toBeCloseTo(-1.0, 4);
  });

  it("collapses CPI and PPI into one INFLATION sample", () => {
    const events = [
      event("a", "CPI", { SPY: -1.0 }),
      event("b", "PPI", { SPY: -3.0 }),
    ];
    const pattern = analyzeCategory(events, "INFLATION");
    expect(pattern.sampleSize).toBe(2);
    expect(pattern.avgReactions[0].avgPercentChange).toBeCloseTo(-2.0, 4);
  });

  it("ranks assets by absolute average move", () => {
    const events = [
      event("a", "CPI", { SPY: -1.0, TLT: -4.0, QQQ: 2.0 }),
      event("b", "CPI", { SPY: -1.0, TLT: -4.0, QQQ: 2.0 }),
    ];
    const pattern = analyzeCategory(events, "INFLATION");
    expect(pattern.avgReactions.map((a) => a.symbol)).toEqual([
      "TLT",
      "QQQ",
      "SPY",
    ]);
    expect(pattern.biggestMover).toBe("TLT");
  });

  it("computes a win rate as the share agreeing with the average direction", () => {
    const events = [
      event("a", "CPI", { SPY: -1.0 }),
      event("b", "CPI", { SPY: -1.0 }),
      event("c", "CPI", { SPY: -1.0 }),
      event("d", "CPI", { SPY: 3.0 }),
    ];
    const pattern = analyzeCategory(events, "INFLATION");
    const spy = pattern.avgReactions[0];
    // Mean is 0.0 → FLAT, and no single observation is exactly flat.
    expect(spy.eventCount).toBe(4);
    expect(spy.winRate).toBe(0);
  });

  it("reports a clean win rate when every observation agrees", () => {
    const events = [
      event("a", "CPI", { SPY: -1.0 }),
      event("b", "CPI", { SPY: -2.0 }),
    ];
    const spy = analyzeCategory(events, "INFLATION").avgReactions[0];
    expect(spy.direction).toBe("DOWN");
    expect(spy.winRate).toBe(1);
  });

  it("refuses to call a single-observation asset 'most consistent'", () => {
    // One event is not a consistency claim.
    const pattern = analyzeCategory([event("a", "CPI", { SPY: -1.0 })], "INFLATION");
    expect(pattern.biggestMover).toBe("SPY");
    expect(pattern.mostConsistentAsset).toBeNull();
  });

  it("names the most consistent asset once there are two observations", () => {
    const events = [
      event("a", "CPI", { SPY: -1.0, QQQ: -1.0 }),
      event("b", "CPI", { SPY: -1.0, QQQ: 5.0 }),
    ];
    const pattern = analyzeCategory(events, "INFLATION");
    expect(pattern.mostConsistentAsset).toBe("SPY");
  });

  it("returns an empty, safe result for a category with no events", () => {
    const pattern = analyzeCategory([], "TARIFF");
    expect(pattern).toMatchObject({
      category: "TARIFF",
      avgReactions: [],
      biggestMover: null,
      mostConsistentAsset: null,
      sampleSize: 0,
      measuredSampleSize: 0,
    });
  });
});
