import { describe, expect, it } from "vitest";

import { METRICS } from "@/services/macro/metrics";
import {
  repairWriteData,
  validateSurpriseConsistency,
} from "../scripts/maintenance/repair-data-releases";

describe("repairWriteData (review #6)", () => {
  it("writes NSA values together with the fetched series attribution", () => {
    // Repairing a legacy PPIFIS (SA) row onto PPIFID must not leave NSA
    // numbers attributed to the SA FRED URL.
    const payload = repairWriteData({
      metricName: "PPI (final demand, YoY)",
      actualValue: 2.1,
      priorValue: 1.6,
      surpriseMagnitude: -0.1,
      expectedValue: 2.2,
      actualSource: "FRED",
      actualSourceUrl: "https://fred.stlouisfed.org/series/PPIFID",
    });

    expect(payload).toEqual({
      metricName: "PPI (final demand, YoY)",
      actualValue: 2.1,
      priorValue: 1.6,
      surpriseMagnitude: -0.1,
      actualSource: "FRED",
      actualSourceUrl: "https://fred.stlouisfed.org/series/PPIFID",
    });
    expect(payload.actualSourceUrl).not.toContain("PPIFIS");
  });
});

describe("validateSurpriseConsistency (review round 2 #2)", () => {
  it("accepts null surprise when SA/NSA forecast basis is unknown", () => {
    expect(
      validateSurpriseConsistency({
        metric: METRICS.PPI_HEADLINE,
        expectedValue: 2.2,
        actualValue: 2.1,
        surpriseMagnitude: null,
        expectedSeasonalAdjustment: null,
      }),
    ).toEqual([]);
  });

  it("accepts null surprise when forecast basis mismatches the metric", () => {
    expect(
      validateSurpriseConsistency({
        metric: METRICS.PPI_HEADLINE,
        expectedValue: 2.2,
        actualValue: 2.1,
        surpriseMagnitude: null,
        expectedSeasonalAdjustment: "SA",
      }),
    ).toEqual([]);
  });

  it("requires actual − expected when a non-null surprise is present", () => {
    expect(
      validateSurpriseConsistency({
        metric: METRICS.PPI_HEADLINE,
        expectedValue: 2.2,
        actualValue: 2.1,
        surpriseMagnitude: -0.1,
        expectedSeasonalAdjustment: "NSA",
      }),
    ).toEqual([]);

    expect(
      validateSurpriseConsistency({
        metric: METRICS.PPI_HEADLINE,
        expectedValue: 2.2,
        actualValue: 2.1,
        surpriseMagnitude: 0.5,
        expectedSeasonalAdjustment: "NSA",
      }),
    ).toEqual([
      expect.stringMatching(/surprise 0\.5 ≠ actual − expected/),
    ]);
  });

  it("requires a surprise for na-basis metrics when expected exists", () => {
    expect(
      validateSurpriseConsistency({
        metric: METRICS.FED_TARGET_UPPER,
        expectedValue: 5.25,
        actualValue: 5.0,
        surpriseMagnitude: null,
        expectedSeasonalAdjustment: null,
      }),
    ).toEqual([
      expect.stringMatching(/surprise null ≠ actual − expected/),
    ]);

    expect(
      validateSurpriseConsistency({
        metric: METRICS.FED_TARGET_UPPER,
        expectedValue: 5.25,
        actualValue: 5.0,
        surpriseMagnitude: -0.25,
        expectedSeasonalAdjustment: null,
      }),
    ).toEqual([]);
  });
});
