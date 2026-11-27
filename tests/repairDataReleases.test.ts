import { describe, expect, it } from "vitest";

import { repairWriteData } from "../scripts/maintenance/repair-data-releases";

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
