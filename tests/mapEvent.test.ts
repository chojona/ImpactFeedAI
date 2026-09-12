import { describe, expect, it } from "vitest";

import {
  buildSummary,
  mapEvent,
  maxAbsMove,
  type EventRow,
} from "@/services/events/mapEvent";
import { measurementSeries, pctForMeasure } from "@/services/events/reactionView";
import { CURRENT_REACTION_CALCULATION_VERSION } from "@/services/events/timing";
import {
  CATEGORY_CONFIG,
  categoryForEventType,
  eventTypesForCategory,
  FILTERABLE_CATEGORIES,
} from "@/lib/eventCategories";
import type { EventCategory, EventTypeName } from "@/types/events";

/** One measurement row. `pctChange` derives from anchor/endpoint unless overridden. */
const measurement = (
  symbol: string,
  measure: EventRow["reactionMeasurements"][number]["measure"],
  over: Partial<EventRow["reactionMeasurements"][number]> = {},
): EventRow["reactionMeasurements"][number] => {
  const anchorPrice = over.anchorPrice ?? 100;
  const endpointPrice = over.endpointPrice ?? 100;
  return {
    symbol,
    measure,
    anchorKind: measure === "INTRADAY_60M" ? "PRE_RELEASE_INTRADAY_BAR" : "PRIOR_SESSION_CLOSE",
    anchorPrice,
    anchorBarAt: new Date("2025-05-12T13:30:00Z"),
    anchorSessionDay: new Date("2025-05-12T00:00:00Z"),
    endpointPrice,
    endpointBarAt: new Date("2025-05-13T13:30:00Z"),
    endpointSessionDay: new Date("2025-05-13T00:00:00Z"),
    releaseSessionDay: new Date("2025-05-13T00:00:00Z"),
    pctChange: ((endpointPrice - anchorPrice) / anchorPrice) * 100,
    priceBasis: "SPLIT_ADJUSTED",
    sessionBasis: "US_EQUITY_RTH",
    calculationVersion: CURRENT_REACTION_CALCULATION_VERSION,
    ...over,
  };
};

/** A RELEASE_SESSION-only row for one symbol, at the given pctChange. */
const reaction = (
  symbol: string,
  over: { pctChange1h?: number; pctChange1d?: number; pctChange1w?: number } = {},
): EventRow["reactionMeasurements"][number][] => {
  const rows: EventRow["reactionMeasurements"][number][] = [];
  if (over.pctChange1h !== undefined) {
    rows.push(measurement(symbol, "INTRADAY_60M", { pctChange: over.pctChange1h }));
  }
  if (over.pctChange1d !== undefined) {
    rows.push(measurement(symbol, "RELEASE_SESSION", { pctChange: over.pctChange1d }));
  }
  if (over.pctChange1w !== undefined) {
    rows.push(measurement(symbol, "SESSION_PLUS_5", { pctChange: over.pctChange1w }));
  }
  return rows;
};

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

type MeasurementRow = EventRow["reactionMeasurements"][number];

const row = (
  over: Partial<Omit<EventRow, "reactionMeasurements">> & {
    reactionMeasurements?: (MeasurementRow | MeasurementRow[])[];
  } = {},
): EventRow => ({
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
  dataReleases: [],
  ...over,
  reactionMeasurements: (over.reactionMeasurements ?? []).flat(),
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
          reactionMeasurements: [reaction("SPY", { pctChange1d: 1.2 })],
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
        reactionMeasurements: [reaction("SPY", { pctChange1d: 1.2 })],
      }),
    );
    expect(event.timing.ineligibilityReason).toBe("missing_timing_source");
    expect(event.assets).toEqual([]);
  });

  it("requires a valid exact timestamp even when the status is verified", () => {
    const missing = mapEvent(
      row({
        releaseAt: null,
        reactionMeasurements: [reaction("SPY", { pctChange1d: 1.2 })],
      }),
    );
    expect(missing.timing.ineligibilityReason).toBe(
      "missing_release_timestamp",
    );
    expect(missing.assets).toEqual([]);

    const invalid = mapEvent(
      row({
        releaseAt: new Date(Number.NaN),
        reactionMeasurements: [reaction("SPY", { pctChange1d: 1.2 })],
      }),
    );
    expect(invalid.timing.ineligibilityReason).toBe(
      "missing_release_timestamp",
    );
    expect(invalid.date).toBe("2025-05-13T12:30:00.000Z");
    expect(invalid.assets).toEqual([]);
  });

  it("accepts official scheduled timing and exposes the headline measure", () => {
    const event = mapEvent(
      row({
        timingStatus: "SCHEDULED",
        reactionMeasurements: [reaction("SPY", { pctChange1d: 1.2 })],
      }),
    );
    expect(event.timing.reactionEligible).toBe(true);
    expect(event.assets[0].measures.RELEASE_SESSION?.anchorBarAt).toBe(
      "2025-05-12T13:30:00.000Z",
    );
    expect(event.assets[0].headlineMeasure).toBe("RELEASE_SESSION");
  });

  it("drops rows at a stale calculation version", () => {
    const event = mapEvent(
      row({
        reactionMeasurements: [
          measurement("SPY", "RELEASE_SESSION", { pctChange: 9, calculationVersion: 2 }),
          measurement("QQQ", "RELEASE_SESSION", { pctChange: 8, calculationVersion: 1 }),
          reaction("TLT", { pctChange1d: -1 }),
        ],
      }),
    );
    expect(event.assets.map((asset) => asset.symbol)).toEqual(["TLT"]);
  });

  it("never publishes a non-finite stored value — the measure is simply absent", () => {
    const event = mapEvent(
      row({
        reactionMeasurements: [
          measurement("SPY", "RELEASE_SESSION", { pctChange: Number.POSITIVE_INFINITY }),
          measurement("SPY", "INTRADAY_60M", { anchorPrice: Number.NaN }),
        ],
      }),
    );
    expect(event.assets[0]).toMatchObject({
      measures: {},
      headlineMeasure: null,
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

  describe("headline measure selection", () => {
    it("always headlines RELEASE_SESSION when present, regardless of other measures", () => {
      const event = mapEvent(
        row({
          reactionMeasurements: [
            reaction("SPY", { pctChange1h: 0.1, pctChange1d: 0.8, pctChange1w: 1.7 }),
          ],
        }),
      );
      expect(event.assets[0].headlineMeasure).toBe("RELEASE_SESSION");
      expect(event.assets[0].percentChange).toBe(0.8);
      expect(event.assets[0].direction).toBe("UP");
    });

    it("does not substitute another measure for the missing headline", () => {
      const weekOnly = mapEvent(
        row({ reactionMeasurements: [reaction("SPY", { pctChange1w: -2.4 })] }),
      );
      expect(weekOnly.assets[0].measures.SESSION_PLUS_5?.pctChange).toBe(-2.4);
      expect(weekOnly.assets[0].headlineMeasure).toBeNull();
      expect(weekOnly.assets[0].percentChange).toBeNull();
      expect(weekOnly.assets[0].direction).toBeNull();

      const hourOnly = mapEvent(
        row({ reactionMeasurements: [reaction("SPY", { pctChange1h: 0.3 })] }),
      );
      expect(hourOnly.assets[0].measures.INTRADAY_60M?.pctChange).toBe(0.3);
      expect(hourOnly.assets[0].headlineMeasure).toBeNull();
    });

    it("reports null — not FLAT — when the headline measure was not measurable", () => {
      // A symbol only ever appears with a non-headline measure present —
      // v3 has no placeholder row for "nothing was measured at all".
      const event = mapEvent(row({ reactionMeasurements: [reaction("SPY", { pctChange1w: 1 })] }));
      expect(event.assets[0].headlineMeasure).toBeNull();
      expect(event.assets[0].percentChange).toBeNull();
      expect(event.assets[0].direction).toBeNull();
    });

    it("reports FLAT for a genuinely zero move", () => {
      const event = mapEvent(
        row({ reactionMeasurements: [reaction("SPY", { pctChange1d: 0 })] }),
      );
      expect(event.assets[0].direction).toBe("FLAT");
      expect(event.assets[0].percentChange).toBe(0);
    });
  });

  it("resolves symbol metadata and orders assets for display", () => {
    const event = mapEvent(
      row({
        reactionMeasurements: [
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
      row({ reactionMeasurements: [reaction("^VIX", { pctChange1d: 5 })] }),
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
        reactionMeasurements: [
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
        reactionMeasurements: [reaction("SPY"), reaction("QQQ", { pctChange1d: 1.5 })],
      }),
    );
    expect(maxAbsMove(event)).toBeCloseTo(1.5, 4);
  });

  it("is null when nothing was measured", () => {
    const event = mapEvent(row({ reactionMeasurements: [reaction("SPY")] }));
    expect(maxAbsMove(event)).toBeNull();
  });
});

describe("reactionView", () => {
  const asset = mapEvent(
    row({
      reactionMeasurements: [
        reaction("SPY", { pctChange1h: 0.2, pctChange1w: 1.7 }),
      ],
    }),
  ).assets[0];

  it("reads each measure by name", () => {
    expect(pctForMeasure(asset, "INTRADAY_60M")).toBe(0.2);
    expect(pctForMeasure(asset, "RELEASE_SESSION")).toBeNull();
    expect(pctForMeasure(asset, "SESSION_PLUS_5")).toBe(1.7);
  });

  it("emits only the measures actually present, never interpolating", () => {
    expect(measurementSeries(asset).map((p: { label: string }) => p.label)).toEqual([
      "First hour",
      "5 sessions",
    ]);
    expect(measurementSeries(asset).map((p: { value: number }) => p.value)).toEqual([0.2, 1.7]);
  });

  it("returns nothing when no measure was measured", () => {
    // The engine writes no row for what it cannot measure — a symbol only
    // ever appears in `assets` backed by at least one real measurement.
    const measures: Record<string, never> = {};
    expect(
      measurementSeries({
        symbol: "SPY",
        name: "S&P 500",
        assetType: "INDEX",
        sessionBasis: "US_EQUITY_RTH",
        measures,
        headlineMeasure: null,
        percentChange: null,
        direction: null,
      }),
    ).toEqual([]);
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
