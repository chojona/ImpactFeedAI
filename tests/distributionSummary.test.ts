import { describe, expect, it } from "vitest";

import {
  MIN_DISTRIBUTION_SAMPLE,
  distributionFor,
  summarizeDistribution,
  type DistributionPoint,
  type ReactionObservation,
} from "@/services/analytics/patternAnalysis";
import type { EventCategory, ReactionMeasure } from "@/types/events";

/**
 * `summarizeDistribution` is the single definition of every number the dot plot
 * and its caption display. These tests target the ways a distribution summary
 * can mislead: reporting a sample larger than the observations behind it,
 * describing a two-point set in the language of a distribution, treating an
 * unmeasured window as a flat market, and marking an event that is not actually
 * in the set.
 */

const observation = (
  eventId: string,
  symbol: string,
  values: Partial<Record<ReactionMeasure, number>>,
  category: EventCategory = "INFLATION",
): ReactionObservation => ({
  eventId,
  title: `${eventId} headline`,
  at: "2025-05-13T12:30:00.000Z",
  category,
  symbol,
  sessionBasis: "US_EQUITY_RTH",
  values,
});

const point = (eventId: string, value: number): DistributionPoint => ({
  eventId,
  title: `${eventId} headline`,
  at: "2025-05-13T12:30:00.000Z",
  value,
});

const summarize = (
  points: readonly DistributionPoint[],
  selectedEventId: string | null = null,
) =>
  summarizeDistribution(points, {
    symbol: "SPY",
    measure: "RELEASE_SESSION" as const,
    selectedEventId,
  });

describe("summarizeDistribution — sample size", () => {
  it("returns null for an empty set rather than a zero-filled summary", () => {
    // A `count: 0, median: 0` object renders identically to a measured flat
    // market, which is the exact substitution the integrity rules forbid.
    expect(summarize([])).toBeNull();
  });

  it("counts observations, never the events that produced them", () => {
    const summary = summarize([point("a", 1), point("b", -2), point("c", 0.5)]);
    expect(summary?.count).toBe(3);
  });

  it("marks a sample below the floor as insufficient", () => {
    const summary = summarize([point("a", 1), point("b", -2)]);
    expect(summary?.count).toBe(2);
    expect(summary?.sufficient).toBe(false);
  });

  it("marks a sample at the floor as sufficient", () => {
    const points = Array.from({ length: MIN_DISTRIBUTION_SAMPLE }, (_, i) =>
      point(`e${i}`, i),
    );
    expect(summarize(points)?.sufficient).toBe(true);
  });

  it("still reports a median for a thin sample, flagged rather than hidden", () => {
    // The number is well-defined arithmetic; the honesty lives in `sufficient`,
    // which is what the caption keys off to withhold the mean.
    const summary = summarize([point("a", 2), point("b", 4)]);
    expect(summary?.median).toBe(3);
    expect(summary?.sufficient).toBe(false);
  });
});

describe("summarizeDistribution — statistics", () => {
  it("computes the median as an order statistic of the points shown", () => {
    const summary = summarize([
      point("a", 5),
      point("b", -1),
      point("c", 2),
    ]);
    expect(summary?.median).toBe(2);
  });

  it("averages the middle pair for an even count", () => {
    const summary = summarize([
      point("a", 1),
      point("b", 2),
      point("c", 3),
      point("d", 6),
    ]);
    expect(summary?.median).toBe(2.5);
  });

  it("reports mean, min, max and range over the same set", () => {
    const summary = summarize([
      point("a", -2),
      point("b", 1),
      point("c", 4),
    ]);
    expect(summary?.mean).toBeCloseTo(1, 10);
    expect(summary?.min).toBe(-2);
    expect(summary?.max).toBe(4);
    expect(summary?.range).toBe(6);
  });

  it("separates a measured zero from up and down rather than dropping it", () => {
    const summary = summarize([
      point("a", 1.5),
      point("b", 0),
      point("c", -0.5),
    ]);
    expect(summary?.positive).toBe(1);
    expect(summary?.negative).toBe(1);
    expect(summary?.flat).toBe(1);
  });

  it("keeps the directional counts summing to the sample size", () => {
    const points = [
      point("a", 2),
      point("b", -3),
      point("c", 0),
      point("d", 0.25),
    ];
    const summary = summarize(points);
    expect(
      (summary?.positive ?? 0) + (summary?.negative ?? 0) + (summary?.flat ?? 0),
    ).toBe(points.length);
  });

  it("handles an all-negative set without inventing a positive tail", () => {
    const summary = summarize([
      point("a", -1),
      point("b", -3),
      point("c", -2),
    ]);
    expect(summary?.positive).toBe(0);
    expect(summary?.max).toBe(-1);
    expect(summary?.median).toBe(-2);
  });

  it("does not mutate the caller's array", () => {
    const points = [point("a", 3), point("b", 1)];
    summarize(points);
    expect(points.map((p) => p.eventId)).toEqual(["a", "b"]);
  });
});

describe("summarizeDistribution — selected event", () => {
  const points = [
    point("worst", -4),
    point("mid", 0.5),
    point("best", 3),
  ];

  it("ranks the selected observation from the most negative move", () => {
    expect(summarize(points, "worst")?.selected?.rank).toBe(1);
    expect(summarize(points, "mid")?.selected?.rank).toBe(2);
    expect(summarize(points, "best")?.selected?.rank).toBe(3);
  });

  it("reports the selected value and its distance from the median", () => {
    const selected = summarize(points, "best")?.selected;
    expect(selected?.value).toBe(3);
    expect(selected?.vsMedian).toBeCloseTo(2.5, 10);
  });

  it("resolves the selection by identity, not by value", () => {
    // Two events that moved identically are still two observations; matching on
    // value would collapse them and misreport the rank.
    const tied = [point("a", 1), point("b", 1), point("c", 5)];
    expect(summarize(tied, "b")?.selected?.eventId).toBe("b");
    expect(summarize(tied, "b")?.count).toBe(3);
  });

  it("marks nothing when the selected event is absent from the set", () => {
    // An event outside this distribution gets no dot. Drawing one would be the
    // same fabrication as inventing an observation.
    expect(summarize(points, "not-in-set")?.selected).toBeNull();
  });

  it("marks nothing when no event is selected", () => {
    expect(summarize(points)?.selected).toBeNull();
  });

  it("withholds a percentile below the sample floor but keeps the rank", () => {
    const thin = [point("a", -1), point("b", 2)];
    const selected = summarize(thin, "b")?.selected;
    expect(selected?.rank).toBe(2);
    expect(selected?.percentile).toBeNull();
  });

  it("reports a percentile once the sample clears the floor", () => {
    const selected = summarize(points, "best")?.selected;
    expect(selected?.percentile).toBeCloseTo(1, 10);
  });
});

describe("distributionFor — what reaches the summary", () => {
  it("orders observations ascending so rank matches the drawn axis", () => {
    const observations = [
      observation("b", "SPY", { "RELEASE_SESSION": 2 }),
      observation("a", "SPY", { "RELEASE_SESSION": -1 }),
      observation("c", "SPY", { "RELEASE_SESSION": 0.5 }),
    ];
    const points = distributionFor(observations, "INFLATION", "SPY", "RELEASE_SESSION");
    expect(points.map((p) => p.eventId)).toEqual(["a", "c", "b"]);
  });

  it("excludes an unmeasured window instead of contributing a zero", () => {
    const observations = [
      observation("a", "SPY", { "RELEASE_SESSION": 1.5 }),
      observation("b", "SPY", { "SESSION_PLUS_5": 2 }),
    ];
    const points = distributionFor(observations, "INFLATION", "SPY", "RELEASE_SESSION");
    const summary = summarize(points);

    expect(points).toHaveLength(1);
    expect(summary?.count).toBe(1);
    expect(summary?.flat).toBe(0);
  });

  it("reflects partial one-hour coverage in the sample size, not in the values", () => {
    // XLE and XLK carry no 1H rows at all — the price-basis guard withholds
    // them rather than mixing split-adjusted daily bars with unadjusted
    // intraday ones. The 1H sample must shrink, and the 1D sample must not.
    const observations = [
      observation("a", "XLE", { "RELEASE_SESSION": 1.2, "SESSION_PLUS_5": 2.0 }),
      observation("b", "XLE", { "RELEASE_SESSION": -0.4, "SESSION_PLUS_5": 1.1 }),
      observation("c", "XLE", { "INTRADAY_60M": 0.3, "RELEASE_SESSION": 0.8, "SESSION_PLUS_5": 0.9 }),
    ];

    const hourly = distributionFor(observations, "INFLATION", "XLE", "INTRADAY_60M");
    const daily = distributionFor(observations, "INFLATION", "XLE", "RELEASE_SESSION");

    expect(
      summarizeDistribution(hourly, { symbol: "XLE", measure: "INTRADAY_60M" })?.count,
    ).toBe(1);
    expect(
      summarizeDistribution(daily, { symbol: "XLE", measure: "RELEASE_SESSION" })?.count,
    ).toBe(3);
  });

  it("does not borrow another horizon to pad a thin sample", () => {
    const observations = [
      observation("a", "SPY", { "INTRADAY_60M": 9, "SESSION_PLUS_5": 9 }),
      observation("b", "SPY", { "RELEASE_SESSION": 1 }),
    ];
    const summary = summarizeDistribution(
      distributionFor(observations, "INFLATION", "SPY", "RELEASE_SESSION"),
      { symbol: "SPY", measure: "RELEASE_SESSION" },
    );
    expect(summary?.count).toBe(1);
    expect(summary?.max).toBe(1);
  });

  it("keeps categories apart so an INFLATION rank is over INFLATION only", () => {
    const observations = [
      observation("a", "SPY", { "RELEASE_SESSION": 1 }, "INFLATION"),
      observation("b", "SPY", { "RELEASE_SESSION": -5 }, "FED"),
      observation("c", "SPY", { "RELEASE_SESSION": 2 }, "INFLATION"),
    ];
    const summary = summarizeDistribution(
      distributionFor(observations, "INFLATION", "SPY", "RELEASE_SESSION"),
      { symbol: "SPY", measure: "RELEASE_SESSION", selectedEventId: "c" },
    );
    expect(summary?.count).toBe(2);
    expect(summary?.selected?.rank).toBe(2);
  });

  it("keeps instruments apart so a QQQ rank is over QQQ only", () => {
    const observations = [
      observation("a", "QQQ", { "RELEASE_SESSION": 1 }),
      observation("b", "SPY", { "RELEASE_SESSION": -5 }),
    ];
    const points = distributionFor(observations, "INFLATION", "QQQ", "RELEASE_SESSION");
    expect(points).toHaveLength(1);
    expect(points[0].eventId).toBe("a");
  });

  it("drops a non-finite reading before it reaches the summary", () => {
    const observations = [
      observation("a", "SPY", { "RELEASE_SESSION": Number.NaN }),
      observation("b", "SPY", { "RELEASE_SESSION": 2 }),
    ];
    const summary = summarizeDistribution(
      distributionFor(observations, "INFLATION", "SPY", "RELEASE_SESSION"),
      { symbol: "SPY", measure: "RELEASE_SESSION" },
    );
    expect(summary?.count).toBe(1);
    expect(Number.isFinite(summary?.median)).toBe(true);
  });
});
