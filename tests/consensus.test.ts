import { describe, expect, it } from "vitest";

import { validateConsensusEstimate } from "@/services/macro/consensus";

describe("validateConsensusEstimate", () => {
  const releaseAt = new Date("2025-02-12T13:30:00Z");
  const estimate = {
    value: 2.9,
    asOf: new Date("2025-02-12T13:00:00Z"),
    source: "Example licensed consensus feed",
    sourceUrl: "https://example.test/consensus/cpi-2025-01",
  };

  it("accepts a sourced pre-release snapshot", () => {
    expect(validateConsensusEstimate(estimate, releaseAt)).toMatchObject({
      value: 2.9,
      source: estimate.source,
    });
  });

  it("rejects look-ahead consensus", () => {
    expect(() =>
      validateConsensusEstimate(
        { ...estimate, asOf: new Date("2025-02-12T13:31:00Z") },
        releaseAt,
      ),
    ).toThrow(/after the release/i);
  });

  it("rejects an unsourced or non-finite value", () => {
    expect(() =>
      validateConsensusEstimate({ ...estimate, source: "" }, releaseAt),
    ).toThrow(/source is required/i);
    expect(() =>
      validateConsensusEstimate({ ...estimate, value: Number.NaN }, releaseAt),
    ).toThrow(/finite/i);
  });
});
