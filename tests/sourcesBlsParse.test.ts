import { describe, expect, it } from "vitest";

import { parseBlsNumericValue } from "../scripts/ingest/sources-bls";

describe("parseBlsNumericValue", () => {
  it("keeps a true zero as zero", () => {
    expect(parseBlsNumericValue("0")).toBe(0);
    expect(parseBlsNumericValue("0.0")).toBe(0);
  });

  it("maps missing / placeholder strings to null, never zero (U2)", () => {
    expect(parseBlsNumericValue("")).toBeNull();
    expect(parseBlsNumericValue("   ")).toBeNull();
    expect(parseBlsNumericValue("-")).toBeNull();
    expect(parseBlsNumericValue(".")).toBeNull();
    expect(parseBlsNumericValue(null)).toBeNull();
    expect(parseBlsNumericValue(undefined)).toBeNull();
  });

  it("parses ordinary numeric strings", () => {
    expect(parseBlsNumericValue("4.6")).toBe(4.6);
    expect(parseBlsNumericValue("157403")).toBe(157403);
  });
});
