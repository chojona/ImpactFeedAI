import { describe, expect, it } from "vitest";

import { SEED_EVENTS } from "../scripts/ingest/events-seed";

describe("SEED_EVENTS headline values", () => {
  it("matches BEA Q2 2025 advance GDP at +3.0% SAAR (U3)", () => {
    // https://www.bea.gov/news/2025/gross-domestic-product-2nd-quarter-2025-advance-estimate
    const event = SEED_EVENTS.find(
      (e) =>
        e.eventType === "MACRO_DATA" &&
        e.referencePeriodStart === "2025-04-01",
    );
    expect(event).toBeDefined();
    expect(event!.headline).toContain("+3.0%");
    expect(event!.headline).not.toContain("+2.8%");
  });
});
