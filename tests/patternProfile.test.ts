import { describe, expect, it } from "vitest";

import {
  distributionFor,
  median,
  profileObservations,
  type ReactionObservation,
} from "@/services/analytics/patternAnalysis";
import { timingDisplay } from "@/services/events/timing";
import type { EventCategory, ReactionWindow } from "@/types/events";

/**
 * The pattern aggregates are the most quotable numbers the product produces, so
 * these tests target the two ways they could mislead: borrowing an observation
 * from one horizon to fill another, and reporting a sample size larger than the
 * data behind it.
 */

const observation = (
  eventId: string,
  symbol: string,
  values: Partial<Record<ReactionWindow, number>>,
  category: EventCategory = "INFLATION",
): ReactionObservation => ({
  eventId,
  title: `${eventId} headline`,
  at: "2025-05-13T12:30:00.000Z",
  category,
  symbol,
  values: {
    "1h": values["1h"] ?? null,
    "1d": values["1d"] ?? null,
    "1w": values["1w"] ?? null,
  },
});

describe("median", () => {
  it("averages the middle pair for an even count", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("does not mutate the caller's array", () => {
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
  });
});

describe("profileObservations", () => {
  it("summarises each horizon over its own observations only", () => {
    // A one-week reading standing in for a missing one-day reading would put
    // two different financial questions in the same statistic.
    const profile = profileObservations(
      [
        observation("a", "SPY", { "1d": -1, "1w": 10 }),
        observation("b", "SPY", { "1d": -3 }),
      ],
      "INFLATION",
    );
    const spy = profile.assets.find((a) => a.symbol === "SPY")!;
    expect(spy.horizons["1d"]?.count).toBe(2);
    expect(spy.horizons["1d"]?.median).toBe(-2);
    expect(spy.horizons["1w"]?.count).toBe(1);
    expect(spy.horizons["1h"]).toBeNull();
  });

  it("never counts an unmeasured window as zero", () => {
    const profile = profileObservations(
      [
        observation("a", "SPY", { "1d": -2 }),
        observation("b", "SPY", {}),
        observation("c", "SPY", { "1d": -4 }),
      ],
      "INFLATION",
    );
    const stats = profile.assets[0].horizons["1d"]!;
    expect(stats.count).toBe(2);
    expect(stats.mean).toBe(-3);
  });

  it("drops non-finite readings before aggregating", () => {
    const profile = profileObservations(
      [
        observation("a", "SPY", { "1d": Number.POSITIVE_INFINITY }),
        observation("b", "SPY", { "1d": 1 }),
      ],
      "INFLATION",
    );
    expect(profile.assets[0].horizons["1d"]?.count).toBe(1);
  });

  it("counts distinct events, not observations", () => {
    const profile = profileObservations(
      [
        observation("a", "SPY", { "1d": 1 }),
        observation("a", "QQQ", { "1d": 2 }),
        observation("b", "SPY", { "1d": 3 }),
      ],
      "INFLATION",
    );
    expect(profile.measuredEvents).toBe(2);
  });

  it("filters to the requested category", () => {
    const profile = profileObservations(
      [
        observation("a", "SPY", { "1d": 1 }),
        observation("b", "SPY", { "1d": 99 }, "FED"),
      ],
      "INFLATION",
    );
    expect(profile.assets[0].horizons["1d"]?.count).toBe(1);
  });

  it("reports directional counts that sum to the sample size", () => {
    const profile = profileObservations(
      [
        observation("a", "SPY", { "1d": 1 }),
        observation("b", "SPY", { "1d": -1 }),
        observation("c", "SPY", { "1d": 0 }),
      ],
      "INFLATION",
    );
    const stats = profile.assets[0].horizons["1d"]!;
    expect(stats.positive).toBe(1);
    expect(stats.negative).toBe(1);
    expect(stats.flat).toBe(1);
    expect(stats.positive + stats.negative + stats.flat).toBe(stats.count);
  });

  it("ranks by the size of the typical one-session move", () => {
    const profile = profileObservations(
      [
        observation("a", "SPY", { "1d": 0.2 }),
        observation("a", "QQQ", { "1d": -2 }),
      ],
      "INFLATION",
    );
    expect(profile.assets.map((a) => a.symbol)).toEqual(["QQQ", "SPY"]);
  });

  it("sorts an asset with no one-day coverage last", () => {
    const profile = profileObservations(
      [
        observation("a", "SPY", { "1d": 0.2 }),
        observation("a", "TLT", { "1w": 99 }),
      ],
      "INFLATION",
    );
    expect(profile.assets.map((a) => a.symbol)).toEqual(["SPY", "TLT"]);
  });

  it("returns an empty, safe profile for a category with nothing measured", () => {
    const profile = profileObservations([], "TARIFF");
    expect(profile).toEqual({
      category: "TARIFF",
      measuredEvents: 0,
      assets: [],
    });
  });
});

describe("distributionFor", () => {
  it("returns one point per measured observation, sorted", () => {
    const points = distributionFor(
      [
        observation("a", "SPY", { "1d": 1 }),
        observation("b", "SPY", { "1d": -2 }),
        observation("c", "SPY", {}),
        observation("d", "QQQ", { "1d": 5 }),
      ],
      "INFLATION",
      "SPY",
      "1d",
    );
    expect(points.map((p) => p.value)).toEqual([-2, 1]);
    expect(points.map((p) => p.eventId)).toEqual(["b", "a"]);
  });

  it("is empty for a horizon with no readings rather than falling back", () => {
    expect(
      distributionFor(
        [observation("a", "SPY", { "1d": 1 })],
        "INFLATION",
        "SPY",
        "1h",
      ),
    ).toEqual([]);
  });
});

describe("timingDisplay", () => {
  it("marks an eligible event as trusted", () => {
    expect(
      timingDisplay({
        status: "VERIFIED",
        reactionEligible: true,
        ineligibilityReason: null,
      }),
    ).toEqual({
      label: "Verified release time",
      explanation: "The release instant is backed by a named timing source.",
      tone: "trusted",
    });
  });

  it("does not call a verified-but-unsourced event verified", () => {
    // The status column alone is not the gate; without provenance the label has
    // to stop claiming the timing is verified.
    const display = timingDisplay({
      status: "VERIFIED",
      reactionEligible: false,
      ineligibilityReason: "missing_timing_source",
    });
    expect(display.label).toBe("Timing provenance incomplete");
    expect(display.tone).toBe("caution");
  });

  it("is cautious for every status that fails closed", () => {
    for (const status of [
      "INFERRED",
      "DATE_ONLY",
      "REFERENCE_PERIOD_ONLY",
      "UNVERIFIED",
    ] as const) {
      expect(
        timingDisplay({
          status,
          reactionEligible: false,
          ineligibilityReason: "untrusted_status",
        }).tone,
      ).toBe("caution");
    }
  });
});
