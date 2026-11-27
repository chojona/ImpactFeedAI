import { describe, expect, it } from "vitest";

import {
  SEED_EVENTS,
  curatedEventKey,
  curatedSeedMatchesExisting,
  legacyCuratedEventKey,
} from "../scripts/ingest/events-seed";

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

describe("curated seed dedup identity (review #5)", () => {
  it("matches an existing +2.8% GDP row after the headline correction", () => {
    const seed = SEED_EVENTS.find(
      (e) =>
        e.eventType === "MACRO_DATA" &&
        e.referencePeriodStart === "2025-04-01",
    );
    expect(seed).toBeDefined();

    const oldHeadline = "Q2 2025 GDP advance reading +2.8%, beats consensus";
    const legacyRow = {
      eventKey: `curated:MACRO_DATA:${oldHeadline}`,
      headline: oldHeadline,
      eventType: "MACRO_DATA",
      occurredAt: seed!.occurredAt,
    };

    // Stable key ignores headline wording / printed value.
    expect(curatedEventKey(seed!)).not.toContain("2.8");
    expect(curatedEventKey(seed!)).not.toContain("3.0");
    expect(curatedEventKey(seed!)).not.toBe(legacyCuratedEventKey(seed!));

    // Re-ingest against a store that still has the old row must skip, not insert.
    expect(curatedSeedMatchesExisting(seed!, legacyRow)).toBe(true);
  });
});
