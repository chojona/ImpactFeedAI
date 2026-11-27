import { describe, expect, it } from "vitest";

import {
  SEED_EVENTS,
  curatedEventKey,
  curatedSeedMatchesExisting,
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

describe("curated seed dedup identity (review round 2 #1)", () => {
  it("maps every current seed 1:1 onto a unique stable key", () => {
    const keys = SEED_EVENTS.map(curatedEventKey);
    expect(keys).toHaveLength(50);
    expect(new Set(keys).size).toBe(50);
  });

  it("matches an existing +2.8% GDP row via explicit previousHeadlines alias", () => {
    const seed = SEED_EVENTS.find(
      (e) =>
        e.eventType === "MACRO_DATA" &&
        e.referencePeriodStart === "2025-04-01",
    );
    expect(seed).toBeDefined();
    expect(seed!.previousHeadlines).toContain(
      "Q2 2025 GDP advance reading +2.8%, beats consensus",
    );

    const oldHeadline = "Q2 2025 GDP advance reading +2.8%, beats consensus";
    const legacyRow = {
      eventKey: `curated:MACRO_DATA:${oldHeadline}`,
      headline: oldHeadline,
      eventType: "MACRO_DATA",
      occurredAt: seed!.occurredAt,
    };

    expect(curatedEventKey(seed!)).not.toContain("2.8");
    expect(curatedEventKey(seed!)).not.toContain("3.0");
    expect(curatedSeedMatchesExisting(seed!, legacyRow)).toBe(true);
  });

  it("does not merge a Fed seed with an auto-ingested FOMC row at the same instant", () => {
    const seed = SEED_EVENTS.find((e) =>
      e.headline.startsWith("Fed cuts 50bps"),
    );
    expect(seed).toBeDefined();

    const fomcAutoRow = {
      eventKey: "macro:FED_TARGET_UPPER:change:2024-09-19",
      headline: "FOMC raises target range to 4.75-5.00%",
      eventType: "FED_DECISION",
      occurredAt: seed!.occurredAt,
    };

    expect(curatedSeedMatchesExisting(seed!, fomcAutoRow)).toBe(false);
  });

  it("does not merge a Core CPI seed with a headline CPI row at the same instant", () => {
    // Synthetic co-timed Core vs headline: type+time alone must not match.
    const headlineCpi = {
      headline: "April CPI surprises cool at 2.3% YoY",
      eventType: "CPI" as const,
      occurredAt: "2025-05-13T08:30:00-04:00",
      referencePeriodStart: "2025-04-01",
    };
    const coreSeed = {
      ...headlineCpi,
      headline: "April Core CPI prints 2.8% YoY",
      metricName: "Core CPI (ex food & energy, YoY)",
    };

    const existingHeadlineRow = {
      eventKey: curatedEventKey(headlineCpi),
      headline: headlineCpi.headline,
      eventType: "CPI",
      occurredAt: headlineCpi.occurredAt,
    };

    expect(curatedSeedMatchesExisting(coreSeed, existingHeadlineRow)).toBe(
      false,
    );
    expect(
      curatedSeedMatchesExisting(headlineCpi, {
        eventKey: curatedEventKey(coreSeed),
        headline: coreSeed.headline,
        eventType: "CPI",
        occurredAt: coreSeed.occurredAt,
      }),
    ).toBe(false);
  });
});
