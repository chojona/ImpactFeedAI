import { describe, expect, it } from "vitest";

import {
  buildSummary,
  mapEvent,
  maxAbsMove,
  type EventRow,
} from "@/services/events/mapEvent";
import { reactionSeries, pctForWindow } from "@/services/events/reactionView";
import { CURRENT_REACTION_CALCULATION_VERSION } from "@/services/events/timing";
import {
  CATEGORY_CONFIG,
  categoryForEventType,
  eventTypesForCategory,
  FILTERABLE_CATEGORIES,
} from "@/lib/eventCategories";
import type { EventCategory, EventTypeName } from "@/types/events";

const reaction = (
  assetSymbol: string,
  over: Partial<EventRow["assetReactions"][number]> = {},
): EventRow["assetReactions"][number] => ({
  assetSymbol,
  priceAtEvent: 100,
  price1h: null,
  price1d: null,
  price1w: null,
  pctChange1h: null,
  pctChange1d: null,
  pctChange1w: null,
  anchorAt: new Date("2025-05-13T13:30:00Z"),
  calculationVersion: CURRENT_REACTION_CALCULATION_VERSION,
  ...over,
});

const releaseRow = (
  over: Partial<EventRow["dataReleases"][number]> = {},
): EventRow["dataReleases"][number] => ({
  metricKey: "CPI_HEADLINE",
  metricName: "CPI (headline, YoY)",
  referencePeriodStart: new Date("2025-04-01T00:00:00Z"),
  expectedValue: null,
  actualValue: null,
  priorValue: null,
  surpriseMagnitude: null,
  actualSource: "BLS",
  actualSourceUrl: "https://www.bls.gov/cpi/",
  consensusStatus: "MISSING",
  consensusSource: null,
  consensusSourceUrl: null,
  consensusAsOf: null,
  ...over,
});

const row = (over: Partial<EventRow> = {}): EventRow => ({
  id: "evt-1",
  headline: "CPI prints 2.3% YoY — below prior (Apr 2025)",
  eventType: "CPI",
  occurredAt: new Date("2025-05-13T12:30:00Z"),
  releaseAt: new Date("2025-05-13T12:30:00Z"),
  releaseDate: new Date("2025-05-13T00:00:00Z"),
  timingStatus: "VERIFIED",
  timingSource: "BLS release calendar",
  sourceUrl: "https://fred.stlouisfed.org/series/CPIAUCNS",
  explanation: null,
  assetReactions: [],
  dataReleases: [],
  ...over,
});

describe("mapEvent", () => {
  it("maps the storage vocabulary onto the display vocabulary", () => {
    const event = mapEvent(row({ eventType: "CPI" }));
    expect(event.eventType).toBe("CPI");
    expect(event.category).toBe("INFLATION");
  });

  it("emits the occurrence time as an ISO UTC instant", () => {
    expect(mapEvent(row()).date).toBe("2025-05-13T12:30:00.000Z");
  });

  it("exposes release timing separately and prefers it as the display instant", () => {
    const event = mapEvent(
      row({
        occurredAt: new Date("2025-04-01T00:00:00Z"),
        releaseAt: new Date("2025-05-13T12:30:00Z"),
      }),
    );
    expect(event.date).toBe("2025-05-13T12:30:00.000Z");
    expect(event.occurredAt).toBe("2025-04-01T00:00:00.000Z");
    expect(event.timing).toEqual({
      status: "VERIFIED",
      releaseAt: "2025-05-13T12:30:00.000Z",
      releaseDate: "2025-05-13",
      source: "BLS release calendar",
      reactionEligible: true,
      ineligibilityReason: null,
    });
  });

  it.each(["INFERRED", "DATE_ONLY", "REFERENCE_PERIOD_ONLY", "UNVERIFIED"] as const)(
    "suppresses reaction rows for %s timing",
    (timingStatus) => {
      const event = mapEvent(
        row({
          timingStatus,
          assetReactions: [reaction("SPY", { pctChange1d: 1.2 })],
        }),
      );
      expect(event.timing.reactionEligible).toBe(false);
      expect(event.timing.ineligibilityReason).toBe("untrusted_status");
      expect(event.assets).toEqual([]);
    },
  );

  it("requires named timing provenance even for a verified timestamp", () => {
    const event = mapEvent(
      row({
        timingSource: "   ",
        assetReactions: [reaction("SPY", { pctChange1d: 1.2 })],
      }),
    );
    expect(event.timing.ineligibilityReason).toBe("missing_timing_source");
    expect(event.assets).toEqual([]);
  });

  it("requires a valid exact timestamp even when the status is verified", () => {
    const missing = mapEvent(
      row({
        releaseAt: null,
        assetReactions: [reaction("SPY", { pctChange1d: 1.2 })],
      }),
    );
    expect(missing.timing.ineligibilityReason).toBe(
      "missing_release_timestamp",
    );
    expect(missing.assets).toEqual([]);

    const invalid = mapEvent(
      row({
        releaseAt: new Date(Number.NaN),
        assetReactions: [reaction("SPY", { pctChange1d: 1.2 })],
      }),
    );
    expect(invalid.timing.ineligibilityReason).toBe(
      "missing_release_timestamp",
    );
    expect(invalid.date).toBe("2025-05-13T12:30:00.000Z");
    expect(invalid.assets).toEqual([]);
  });

  it("accepts official scheduled timing and serializes the actual price anchor", () => {
    const event = mapEvent(
      row({
        timingStatus: "SCHEDULED",
        assetReactions: [reaction("SPY", { pctChange1d: 1.2 })],
      }),
    );
    expect(event.timing.reactionEligible).toBe(true);
    expect(event.assets[0].anchorAt).toBe("2025-05-13T13:30:00.000Z");
    expect(event.assets[0].calculationVersion).toBe(
      CURRENT_REACTION_CALCULATION_VERSION,
    );
  });

  it("drops legacy and unversioned reaction rows", () => {
    const event = mapEvent(
      row({
        assetReactions: [
          reaction("SPY", { calculationVersion: null, pctChange1d: 9 }),
          reaction("QQQ", { calculationVersion: 0, pctChange1d: 8 }),
          reaction("TLT", { pctChange1d: -1 }),
        ],
      }),
    );
    expect(event.assets.map((asset) => asset.symbol)).toEqual(["TLT"]);
  });

  it("sanitizes non-finite reaction values instead of publishing them", () => {
    const event = mapEvent(
      row({
        assetReactions: [
          reaction("SPY", {
            price1d: Number.POSITIVE_INFINITY,
            pctChange1h: Number.NaN,
            pctChange1d: Number.POSITIVE_INFINITY,
            pctChange1w: Number.NEGATIVE_INFINITY,
          }),
        ],
      }),
    );
    expect(event.assets[0]).toMatchObject({
      price1d: null,
      pct1h: null,
      pct1d: null,
      pct1w: null,
      primaryWindow: null,
      percentChange: null,
      direction: null,
    });
  });

  it("carries explanation through as null rather than inventing prose", () => {
    const event = mapEvent(row({ explanation: null }));
    expect(event.explanation).toBeNull();
  });

  it("passes a stored explanation through unchanged", () => {
    const event = mapEvent(row({ explanation: "Shelter drove the miss." }));
    expect(event.explanation).toBe("Shelter drove the miss.");
  });

  describe("primary window selection", () => {
    it("prefers the one-day window", () => {
      const event = mapEvent(
        row({
          assetReactions: [
            reaction("SPY", { pctChange1h: 0.1, pctChange1d: 0.8, pctChange1w: 1.7 }),
          ],
        }),
      );
      expect(event.assets[0].primaryWindow).toBe("1d");
      expect(event.assets[0].percentChange).toBe(0.8);
      expect(event.assets[0].direction).toBe("UP");
    });

    it("does not substitute one-week or one-hour data for the one-day headline", () => {
      const weekOnly = mapEvent(
        row({ assetReactions: [reaction("SPY", { pctChange1w: -2.4 })] }),
      );
      expect(weekOnly.assets[0].pct1w).toBe(-2.4);
      expect(weekOnly.assets[0].primaryWindow).toBeNull();
      expect(weekOnly.assets[0].percentChange).toBeNull();
      expect(weekOnly.assets[0].direction).toBeNull();

      const hourOnly = mapEvent(
        row({ assetReactions: [reaction("SPY", { pctChange1h: 0.3 })] }),
      );
      expect(hourOnly.assets[0].pct1h).toBe(0.3);
      expect(hourOnly.assets[0].primaryWindow).toBeNull();
    });

    it("reports null — not FLAT — when no window was measurable", () => {
      const event = mapEvent(row({ assetReactions: [reaction("SPY")] }));
      expect(event.assets[0].primaryWindow).toBeNull();
      expect(event.assets[0].percentChange).toBeNull();
      expect(event.assets[0].direction).toBeNull();
    });

    it("reports FLAT for a genuinely zero move", () => {
      const event = mapEvent(
        row({ assetReactions: [reaction("SPY", { pctChange1d: 0 })] }),
      );
      expect(event.assets[0].direction).toBe("FLAT");
      expect(event.assets[0].percentChange).toBe(0);
    });
  });

  it("resolves symbol metadata and orders assets for display", () => {
    const event = mapEvent(
      row({
        assetReactions: [
          reaction("XLK", { pctChange1d: 1 }),
          reaction("BTC-USD", { pctChange1d: 2 }),
          reaction("SPY", { pctChange1d: 3 }),
        ],
      }),
    );
    expect(event.assets.map((a) => a.symbol)).toEqual([
      "SPY",
      "BTC-USD",
      "XLK",
    ]);
    expect(event.assets[0].name).toBe("S&P 500");
    expect(event.assets[1].assetType).toBe("CRYPTO");
  });

  it("degrades an unknown symbol to its ticker instead of throwing", () => {
    const event = mapEvent(
      row({ assetReactions: [reaction("^VIX", { pctChange1d: 5 })] }),
    );
    expect(event.assets[0].name).toBe("^VIX");
  });

  it("formats the release in the metric's canonical unit", () => {
    const event = mapEvent(
      row({
        dataReleases: [
          releaseRow({
            expectedValue: 2.4,
            actualValue: 2.3,
            priorValue: 2.4,
            surpriseMagnitude: -0.1,
            consensusStatus: "VERIFIED",
            consensusSource: "Survey source",
            consensusSourceUrl: "https://example.com/consensus",
            consensusAsOf: new Date("2025-05-13T12:00:00Z"),
          }),
        ],
      }),
    );
    expect(event.release).toEqual({
      metricKey: "CPI_HEADLINE",
      metricName: "CPI (headline, YoY)",
      referencePeriodStart: "2025-04-01",
      expectedValue: 2.4,
      actualValue: 2.3,
      priorValue: 2.4,
      surpriseMagnitude: -0.1,
      expected: "2.4%",
      actual: "2.3%",
      prior: "2.4%",
      surprise: "-0.1pp",
      surpriseValue: -0.1,
      actualSource: "BLS",
      actualSourceUrl: "https://www.bls.gov/cpi/",
      consensusStatus: "VERIFIED",
      consensusSource: "Survey source",
      consensusSourceUrl: "https://example.com/consensus",
      consensusAsOf: "2025-05-13T12:00:00.000Z",
    });
  });

  it("leaves the release null when the event has none", () => {
    expect(mapEvent(row()).release).toBeNull();
  });

  it("returns every release in deterministic metric order", () => {
    const event = mapEvent(
      row({
        dataReleases: [
          releaseRow({
            metricKey: "CPI_HEADLINE",
            metricName: "CPI",
            referencePeriodStart: new Date("2025-04-01T00:00:00Z"),
            actualValue: 2.3,
          }),
          releaseRow({
            metricKey: "CORE_CPI",
            metricName: "Core CPI",
            referencePeriodStart: new Date("2025-04-01T00:00:00Z"),
            actualValue: 2.8,
          }),
        ],
      }),
    );

    expect(event.releases.map((release) => release.metricKey)).toEqual([
      "CORE_CPI",
      "CPI_HEADLINE",
    ]);
    expect(event.release).toBe(event.releases[0]);
    expect(event.releases[0].referencePeriodStart).toBe("2025-04-01");
  });

  it("renders a missing consensus as null, which is the common case", () => {
    // FRED and BLS publish actuals only.
    const event = mapEvent(
      row({
        dataReleases: [
          releaseRow({
            metricKey: "UNEMPLOYMENT_RATE",
            metricName: "Unemployment rate",
            expectedValue: null,
            actualValue: 4.3,
            priorValue: 4.4,
            surpriseMagnitude: null,
          }),
        ],
      }),
    );
    expect(event.release!.expected).toBeNull();
    expect(event.release!.surprise).toBeNull();
    expect(event.release!.actual).toBe("4.30%");
  });
});

describe("buildSummary", () => {
  it("states only the values that exist", () => {
    const event = mapEvent(
      row({
        dataReleases: [
          releaseRow({
            metricKey: "UNEMPLOYMENT_RATE",
            metricName: "Unemployment rate",
            expectedValue: null,
            actualValue: 4.3,
            priorValue: 4.4,
            surpriseMagnitude: null,
          }),
        ],
      }),
    );
    expect(event.summary).toBe(
      "Unemployment rate — actual 4.30% · prior 4.40%",
    );
    expect(event.summary).not.toContain("consensus");
    expect(event.summary).not.toContain("surprise");
  });

  it("includes the surprise when a consensus exists", () => {
    const event = mapEvent(
      row({
        dataReleases: [
          releaseRow({
            expectedValue: 2.4,
            actualValue: 2.3,
            priorValue: 2.4,
            surpriseMagnitude: -0.1,
            consensusStatus: "VERIFIED",
          }),
        ],
      }),
    );
    expect(event.summary).toBe(
      "CPI (headline, YoY) — actual 2.3% · consensus 2.4% · prior 2.4% · surprise -0.1pp",
    );
  });

  it("labels supplied but unverified expectations and surprises", () => {
    const event = mapEvent(
      row({
        dataReleases: [
          releaseRow({
            expectedValue: 2.4,
            actualValue: 2.3,
            surpriseMagnitude: -0.1,
            consensusStatus: "UNVERIFIED",
          }),
        ],
      }),
    );
    expect(event.summary).toBe(
      "CPI (headline, YoY) — actual 2.3% · unverified consensus 2.4% · unverified surprise -0.1pp",
    );
  });

  it("is null when there is no release at all", () => {
    expect(buildSummary(null)).toBeNull();
  });

  it("is null when a release exists but every value is missing", () => {
    const emptyRelease = mapEvent(
      row({ dataReleases: [releaseRow()] }),
    ).release;
    expect(buildSummary(emptyRelease)).toBeNull();
  });
});

describe("maxAbsMove", () => {
  it("is the largest absolute measured move", () => {
    const event = mapEvent(
      row({
        assetReactions: [
          reaction("SPY", { pctChange1d: -1.2 }),
          reaction("QQQ", { pctChange1d: 3.4 }),
          reaction("TLT", { pctChange1d: -5.1 }),
        ],
      }),
    );
    expect(maxAbsMove(event)).toBeCloseTo(5.1, 4);
  });

  it("ignores unmeasured assets instead of counting them as zero", () => {
    const event = mapEvent(
      row({
        assetReactions: [reaction("SPY"), reaction("QQQ", { pctChange1d: 1.5 })],
      }),
    );
    expect(maxAbsMove(event)).toBeCloseTo(1.5, 4);
  });

  it("is null when nothing was measured", () => {
    const event = mapEvent(row({ assetReactions: [reaction("SPY")] }));
    expect(maxAbsMove(event)).toBeNull();
  });
});

describe("reactionView", () => {
  const asset = mapEvent(
    row({
      assetReactions: [
        reaction("SPY", { pctChange1h: 0.2, pctChange1w: 1.7 }),
      ],
    }),
  ).assets[0];

  it("reads each window by name", () => {
    expect(pctForWindow(asset, "1h")).toBe(0.2);
    expect(pctForWindow(asset, "1d")).toBeNull();
    expect(pctForWindow(asset, "1w")).toBe(1.7);
  });

  it("starts the path at zero and skips unmeasured windows without interpolating", () => {
    expect(reactionSeries(asset)).toEqual([
      { label: "T", value: 0 },
      { label: "1H", value: 0.2 },
      { label: "1W", value: 1.7 },
    ]);
  });

  it("returns just the anchor when nothing was measured", () => {
    const bare = mapEvent(row({ assetReactions: [reaction("SPY")] })).assets[0];
    expect(reactionSeries(bare)).toEqual([{ label: "T", value: 0 }]);
  });
});

describe("category mapping", () => {
  const ALL_EVENT_TYPES: EventTypeName[] = [
    "TARIFF",
    "FED_DECISION",
    "CPI",
    "PPI",
    "NFP",
    "GEOPOLITICAL",
    "EARNINGS_SURPRISE",
    "MACRO_DATA",
  ];

  it("maps every event type to a configured category", () => {
    for (const type of ALL_EVENT_TYPES) {
      const category = categoryForEventType(type);
      expect(CATEGORY_CONFIG[category]).toBeDefined();
    }
  });

  it("round-trips: every type is reachable from its own category's filter", () => {
    for (const type of ALL_EVENT_TYPES) {
      const category = categoryForEventType(type);
      expect(eventTypesForCategory(category)).toContain(type);
    }
  });

  it("partitions the event types — no type reachable from two categories", () => {
    const seen = new Set<EventTypeName>();
    for (const category of Object.keys(CATEGORY_CONFIG) as EventCategory[]) {
      for (const type of eventTypesForCategory(category)) {
        expect(seen.has(type)).toBe(false);
        seen.add(type);
      }
    }
    expect(seen.size).toBe(ALL_EVENT_TYPES.length);
  });

  it("offers every category with at least one event type as a filter", () => {
    for (const category of FILTERABLE_CATEGORIES) {
      expect(eventTypesForCategory(category).length).toBeGreaterThan(0);
    }
  });

  it("keeps the higherIsBetter direction the surprise colouring depends on", () => {
    // Per CLAUDE.md: a hot inflation print is a negative surprise, a bigger
    // payroll number is a positive one.
    expect(CATEGORY_CONFIG.INFLATION.higherIsBetter).toBe(false);
    expect(CATEGORY_CONFIG.FED.higherIsBetter).toBe(false);
    expect(CATEGORY_CONFIG.TARIFF.higherIsBetter).toBe(false);
    expect(CATEGORY_CONFIG.JOBS.higherIsBetter).toBe(true);
    expect(CATEGORY_CONFIG.EARNINGS.higherIsBetter).toBe(true);
  });
});
