import { describe, expect, it } from "vitest";

import {
  EQUITY_RV_SESSIONS,
  FEATURE_DEFINITIONS,
  REGIME_FEATURE_DEFINITION_VERSION,
  SERIES_KEYS,
  VIX_PERCENTILE_LOOKBACK,
} from "@/services/context/featureDefinitions";
import {
  indexSeriesByObservationDate,
  isAvailableBeforeCutoff,
  isMarketObservationEligible,
  isValidObservationDate,
  marketObservationIneligibilityReasons,
} from "@/services/context/pointInTime";
import { computeSpread2s10s } from "@/services/context/rates";
import {
  computeEquityRealizedVol20,
  computeVixLevel,
  computeVixTrailingPercentile,
} from "@/services/context/volatility";
import type {
  ContextUnit,
  FeatureComputeRequest,
  KnowledgeMode,
  MarketContextObservation,
} from "@/types/context";

const MODE: KnowledgeMode = "PUBLIC_INFORMATION_RECONSTRUCTION";

function at(iso: string): Date {
  return new Date(iso);
}

function obs(args: {
  id: string;
  seriesKey: string;
  value: number | null;
  unit: ContextUnit;
  observationDate: string;
  observationAt: string;
  availableAt: string | null;
  fetchedAt?: string | null;
  quality?: MarketContextObservation["quality"];
}): MarketContextObservation {
  return {
    id: args.id,
    seriesKey: args.seriesKey,
    value: args.value,
    unit: args.unit,
    observationDate: args.observationDate,
    observationAt: at(args.observationAt),
    availableAt: args.availableAt === null ? null : at(args.availableAt),
    fetchedAt:
      args.fetchedAt === undefined
        ? undefined
        : args.fetchedAt === null
          ? null
          : at(args.fetchedAt),
    quality: args.quality,
  };
}

function request(
  cutoff: string,
  observations: MarketContextObservation[],
  options: {
    knowledgeMode?: KnowledgeMode;
    sessionCalendar?: readonly string[];
  } = {},
): FeatureComputeRequest {
  return {
    cutoff: at(cutoff),
    knowledgeMode: options.knowledgeMode ?? MODE,
    observations,
    sessionCalendar: options.sessionCalendar,
  };
}

function tradingDates(count: number, start = "2024-01-02"): string[] {
  const dates: string[] = [];
  let day = at(`${start}T00:00:00.000Z`);
  while (dates.length < count) {
    const wd = day.getUTCDay();
    if (wd !== 0 && wd !== 6) {
      dates.push(day.toISOString().slice(0, 10));
    }
    day = new Date(day.getTime() + 24 * 60 * 60 * 1000);
  }
  return dates;
}

function availableAfterClose(date: string): string {
  // Synthetic: treat close as 21:00Z same calendar day.
  return `${date}T21:00:00.000Z`;
}

describe("point-in-time eligibility", () => {
  it("uses a strict availableAt < cutoff boundary", () => {
    const cutoff = at("2024-06-15T12:00:00.000Z");
    expect(
      isAvailableBeforeCutoff(at("2024-06-15T11:59:59.999Z"), cutoff),
    ).toBe(true);
    expect(
      isAvailableBeforeCutoff(at("2024-06-15T12:00:00.000Z"), cutoff),
    ).toBe(false);
    expect(
      isAvailableBeforeCutoff(at("2024-06-15T12:00:00.001Z"), cutoff),
    ).toBe(false);
  });

  it("rejects null availability and exact-cutoff equality", () => {
    const cutoff = at("2024-06-15T12:00:00.000Z");
    const equal = obs({
      id: "v1",
      seriesKey: SERIES_KEYS.VIXCLS,
      value: 15,
      unit: "index_points",
      observationDate: "2024-06-14",
      observationAt: "2024-06-14T21:00:00.000Z",
      availableAt: "2024-06-15T12:00:00.000Z",
    });
    expect(isMarketObservationEligible(equal, cutoff)).toBe(false);
    expect(marketObservationIneligibilityReasons(equal, cutoff)).toContain(
      "not_available_before_cutoff",
    );

    const missingAvail = { ...equal, availableAt: null };
    expect(isMarketObservationEligible(missingAvail, cutoff)).toBe(false);
    expect(
      marketObservationIneligibilityReasons(missingAvail, cutoff),
    ).toContain("unknown_availability");
  });
});

describe("computeVixLevel", () => {
  it("returns the latest eligible VIX close", () => {
    const result = computeVixLevel(
      request("2024-06-15T12:00:00.000Z", [
        obs({
          id: "a",
          seriesKey: SERIES_KEYS.VIXCLS,
          value: 12,
          unit: "index_points",
          observationDate: "2024-06-13",
          observationAt: "2024-06-13T21:00:00.000Z",
          availableAt: "2024-06-13T21:00:00.000Z",
        }),
        obs({
          id: "b",
          seriesKey: SERIES_KEYS.VIXCLS,
          value: 18.5,
          unit: "index_points",
          observationDate: "2024-06-14",
          observationAt: "2024-06-14T21:00:00.000Z",
          availableAt: "2024-06-14T21:00:00.000Z",
        }),
      ]),
    );
    expect(result.status).toBe("ok");
    expect(result.value).toBe(18.5);
    expect(result.unit).toBe("index_points");
    expect(result.definitionVersion).toBe(REGIME_FEATURE_DEFINITION_VERSION);
    expect(result.featureKey).toBe("vix_level");
  });

  it("excludes observations available at or after the cutoff (lookahead)", () => {
    const result = computeVixLevel(
      request("2024-06-14T21:00:00.000Z", [
        obs({
          id: "old",
          seriesKey: SERIES_KEYS.VIXCLS,
          value: 10,
          unit: "index_points",
          observationDate: "2024-06-13",
          observationAt: "2024-06-13T21:00:00.000Z",
          availableAt: "2024-06-13T21:00:00.000Z",
        }),
        obs({
          id: "same-instant",
          seriesKey: SERIES_KEYS.VIXCLS,
          value: 99,
          unit: "index_points",
          observationDate: "2024-06-14",
          observationAt: "2024-06-14T21:00:00.000Z",
          availableAt: "2024-06-14T21:00:00.000Z",
        }),
      ]),
    );
    expect(result.status).toBe("ok");
    expect(result.value).toBe(10);
    expect(result.inputRefs.map((r) => r.observationId)).toEqual(["old"]);
  });

  it("rejects invalid units without inventing a level", () => {
    const result = computeVixLevel(
      request("2024-06-15T12:00:00.000Z", [
        obs({
          id: "bad",
          seriesKey: SERIES_KEYS.VIXCLS,
          value: 15,
          unit: "pct_level",
          observationDate: "2024-06-14",
          observationAt: "2024-06-14T21:00:00.000Z",
          availableAt: "2024-06-14T21:00:00.000Z",
        }),
      ]),
    );
    expect(result.status).toBe("invalid_input");
    expect(result.value).toBeNull();
    expect(result.reasonCode).toBe("invalid_unit");
  });

  it("is invariant when future rows are appended after a frozen cutoff", () => {
    const base = [
      obs({
        id: "a",
        seriesKey: SERIES_KEYS.VIXCLS,
        value: 14,
        unit: "index_points",
        observationDate: "2024-06-13",
        observationAt: "2024-06-13T21:00:00.000Z",
        availableAt: "2024-06-13T21:00:00.000Z",
      }),
    ];
    const cutoff = "2024-06-14T12:00:00.000Z";
    const before = computeVixLevel(request(cutoff, base));
    const after = computeVixLevel(
      request(cutoff, [
        ...base,
        obs({
          id: "future",
          seriesKey: SERIES_KEYS.VIXCLS,
          value: 40,
          unit: "index_points",
          observationDate: "2024-06-17",
          observationAt: "2024-06-17T21:00:00.000Z",
          availableAt: "2024-06-17T21:00:00.000Z",
        }),
      ]),
    );
    expect(after).toEqual(before);
  });
});

describe("computeVixTrailingPercentile", () => {
  it("requires a complete prior calendar window and excludes the latest from the rank set", () => {
    const dates = tradingDates(VIX_PERCENTILE_LOOKBACK + 1);
    const observations = dates.map((date, i) =>
      obs({
        id: `v${i}`,
        seriesKey: SERIES_KEYS.VIXCLS,
        // Prior values 1..252; latest = 100.
        value: i < VIX_PERCENTILE_LOOKBACK ? i + 1 : 100,
        unit: "index_points",
        observationDate: date,
        observationAt: availableAfterClose(date),
        availableAt: availableAfterClose(date),
      }),
    );
    const cutoffDate = dates[dates.length - 1]!;
    const result = computeVixTrailingPercentile(
      request(`${cutoffDate}T23:00:00.000Z`, observations, {
        sessionCalendar: dates,
      }),
    );
    // prior values 1..252; count <= 100 = 100 → percentile 100*100/252
    expect(result.status).toBe("ok");
    expect(result.value).toBeCloseTo((100 * 100) / 252, 12);
    expect(result.inputRefs).toHaveLength(VIX_PERCENTILE_LOOKBACK + 1);
  });

  it("applies a deterministic inclusive tie rule on a calendar window", () => {
    const dates = tradingDates(5);
    const values = [10, 20, 20, 30, 20];
    const observations = dates.map((date, i) =>
      obs({
        id: `t${i}`,
        seriesKey: SERIES_KEYS.VIXCLS,
        value: values[i]!,
        unit: "index_points",
        observationDate: date,
        observationAt: availableAfterClose(date),
        availableAt: availableAfterClose(date),
      }),
    );
    const result = computeVixTrailingPercentile(
      request(`${dates[4]}T23:00:00.000Z`, observations, {
        sessionCalendar: dates,
      }),
      4,
    );
    // prior = [10,20,20,30]; latest=20; count <=20 = 3 → 75
    expect(result.status).toBe("ok");
    expect(result.value).toBe(75);
  });

  it("requires sessionCalendar and does not claim completeness from available prints alone", () => {
    const dates = tradingDates(VIX_PERCENTILE_LOOKBACK + 1);
    const observations = dates.map((date, i) =>
      obs({
        id: `s${i}`,
        seriesKey: SERIES_KEYS.VIXCLS,
        value: 15 + (i % 5),
        unit: "index_points",
        observationDate: date,
        observationAt: availableAfterClose(date),
        availableAt: availableAfterClose(date),
      }),
    );
    const end = dates[dates.length - 1]!;
    const withoutCalendar = computeVixTrailingPercentile(
      request(`${end}T23:00:00.000Z`, observations),
    );
    expect(withoutCalendar.status).toBe("invalid_input");
    expect(withoutCalendar.reasonCode).toBe("missing_session_calendar");
  });

  it("returns unavailable when a calendar session is missing a source row", () => {
    const dates = tradingDates(VIX_PERCENTILE_LOOKBACK + 1);
    const missing = dates[10]!;
    const observations = dates
      .filter((date) => date !== missing)
      .map((date, i) =>
        obs({
          id: `s${i}`,
          seriesKey: SERIES_KEYS.VIXCLS,
          value: 15 + i,
          unit: "index_points",
          observationDate: date,
          observationAt: availableAfterClose(date),
          availableAt: availableAfterClose(date),
        }),
      );
    const result = computeVixTrailingPercentile(
      request(`${dates[dates.length - 1]}T23:00:00.000Z`, observations, {
        sessionCalendar: dates,
      }),
    );
    expect(result.status).toBe("unavailable");
    expect(result.value).toBeNull();
    expect(result.reasonCode).toBe("incomplete_window");
    expect(result.detail).toContain(missing);
  });

  it("does not let future VIX prints enter a frozen percentile window", () => {
    const dates = tradingDates(VIX_PERCENTILE_LOOKBACK + 1);
    const observations = dates.map((date, i) =>
      obs({
        id: `v${i}`,
        seriesKey: SERIES_KEYS.VIXCLS,
        value: 20,
        unit: "index_points",
        observationDate: date,
        observationAt: availableAfterClose(date),
        availableAt: availableAfterClose(date),
      }),
    );
    const end = dates[dates.length - 1]!;
    const cutoff = `${end}T23:00:00.000Z`;
    const baseline = computeVixTrailingPercentile(
      request(cutoff, observations, { sessionCalendar: dates }),
    );
    const withFuture = computeVixTrailingPercentile(
      request(
        cutoff,
        [
          ...observations,
          obs({
            id: "leak",
            seriesKey: SERIES_KEYS.VIXCLS,
            value: 5,
            unit: "index_points",
            observationDate: "2099-01-02",
            observationAt: "2099-01-02T21:00:00.000Z",
            availableAt: "2099-01-02T21:00:00.000Z",
          }),
        ],
        { sessionCalendar: dates },
      ),
    );
    expect(withFuture).toEqual(baseline);
    expect(baseline.value).toBe(100);
  });
});

describe("computeSpread2s10s", () => {
  it("computes basis-point spread on the latest shared date", () => {
    const result = computeSpread2s10s(
      request("2024-06-15T12:00:00.000Z", [
        obs({
          id: "2y-a",
          seriesKey: SERIES_KEYS.DGS2,
          value: 4.5,
          unit: "pct_level",
          observationDate: "2024-06-13",
          observationAt: "2024-06-13T21:00:00.000Z",
          availableAt: "2024-06-13T21:00:00.000Z",
        }),
        obs({
          id: "10y-a",
          seriesKey: SERIES_KEYS.DGS10,
          value: 4.2,
          unit: "pct_level",
          observationDate: "2024-06-13",
          observationAt: "2024-06-13T21:00:00.000Z",
          availableAt: "2024-06-13T21:00:00.000Z",
        }),
        obs({
          id: "2y-b",
          seriesKey: SERIES_KEYS.DGS2,
          value: 4.6,
          unit: "pct_level",
          observationDate: "2024-06-14",
          observationAt: "2024-06-14T21:00:00.000Z",
          availableAt: "2024-06-14T21:00:00.000Z",
        }),
        obs({
          id: "10y-b",
          seriesKey: SERIES_KEYS.DGS10,
          value: 4.25,
          unit: "pct_level",
          observationDate: "2024-06-14",
          observationAt: "2024-06-14T21:00:00.000Z",
          availableAt: "2024-06-14T21:00:00.000Z",
        }),
      ]),
    );
    expect(result.status).toBe("ok");
    expect(result.value).toBeCloseTo(100 * (4.25 - 4.6), 12);
    expect(result.unit).toBe("basis_points");
  });

  it("requires same observationDate alignment", () => {
    const result = computeSpread2s10s(
      request("2024-06-15T12:00:00.000Z", [
        obs({
          id: "2y",
          seriesKey: SERIES_KEYS.DGS2,
          value: 4.5,
          unit: "pct_level",
          observationDate: "2024-06-13",
          observationAt: "2024-06-13T21:00:00.000Z",
          availableAt: "2024-06-13T21:00:00.000Z",
        }),
        obs({
          id: "10y",
          seriesKey: SERIES_KEYS.DGS10,
          value: 4.2,
          unit: "pct_level",
          observationDate: "2024-06-14",
          observationAt: "2024-06-14T21:00:00.000Z",
          availableAt: "2024-06-14T21:00:00.000Z",
        }),
      ]),
    );
    expect(result.status).toBe("unavailable");
    expect(result.value).toBeNull();
    expect(result.reasonCode).toBe("date_misaligned");
  });

  it("excludes a same-date leg that is not yet available at cutoff", () => {
    const result = computeSpread2s10s(
      request("2024-06-14T20:00:00.000Z", [
        obs({
          id: "2y",
          seriesKey: SERIES_KEYS.DGS2,
          value: 4.5,
          unit: "pct_level",
          observationDate: "2024-06-14",
          observationAt: "2024-06-14T21:00:00.000Z",
          availableAt: "2024-06-14T21:00:00.000Z",
        }),
        obs({
          id: "10y",
          seriesKey: SERIES_KEYS.DGS10,
          value: 4.2,
          unit: "pct_level",
          observationDate: "2024-06-14",
          observationAt: "2024-06-14T21:00:00.000Z",
          availableAt: "2024-06-14T21:00:00.000Z",
        }),
        obs({
          id: "2y-old",
          seriesKey: SERIES_KEYS.DGS2,
          value: 4.0,
          unit: "pct_level",
          observationDate: "2024-06-13",
          observationAt: "2024-06-13T21:00:00.000Z",
          availableAt: "2024-06-13T21:00:00.000Z",
        }),
        obs({
          id: "10y-old",
          seriesKey: SERIES_KEYS.DGS10,
          value: 3.5,
          unit: "pct_level",
          observationDate: "2024-06-13",
          observationAt: "2024-06-13T21:00:00.000Z",
          availableAt: "2024-06-13T21:00:00.000Z",
        }),
      ]),
    );
    expect(result.status).toBe("ok");
    expect(result.value).toBeCloseTo(100 * (3.5 - 4.0), 12);
  });

  it("rejects invalid yield units", () => {
    const result = computeSpread2s10s(
      request("2024-06-15T12:00:00.000Z", [
        obs({
          id: "2y",
          seriesKey: SERIES_KEYS.DGS2,
          value: 4.5,
          unit: "basis_points",
          observationDate: "2024-06-14",
          observationAt: "2024-06-14T21:00:00.000Z",
          availableAt: "2024-06-14T21:00:00.000Z",
        }),
        obs({
          id: "10y",
          seriesKey: SERIES_KEYS.DGS10,
          value: 4.2,
          unit: "pct_level",
          observationDate: "2024-06-14",
          observationAt: "2024-06-14T21:00:00.000Z",
          availableAt: "2024-06-14T21:00:00.000Z",
        }),
      ]),
    );
    expect(result.status).toBe("invalid_input");
    expect(result.value).toBeNull();
    expect(result.reasonCode).toBe("invalid_unit");
  });
});

describe("computeEquityRealizedVol20", () => {
  it("matches a hand-calculated sample SD annualization", () => {
    // 21 closes → 20 returns. Prices: 100,101,102,...,120
    const dates = tradingDates(EQUITY_RV_SESSIONS + 1);
    const observations = dates.map((date, i) =>
      obs({
        id: `p${i}`,
        seriesKey: SERIES_KEYS.SPY,
        value: 100 + i,
        unit: "price",
        observationDate: date,
        observationAt: availableAfterClose(date),
        availableAt: availableAfterClose(date),
      }),
    );

    const closes = observations.map((o) => o.value as number);
    const logReturns = closes
      .slice(1)
      .map((price, i) => Math.log(price / closes[i]!));
    const mean = logReturns.reduce((s, r) => s + r, 0) / logReturns.length;
    const sumSq = logReturns.reduce((s, r) => s + (r - mean) ** 2, 0);
    const expected =
      Math.sqrt(sumSq / (logReturns.length - 1)) * Math.sqrt(252) * 100;

    const end = dates[dates.length - 1]!;
    const result = computeEquityRealizedVol20(
      request(`${end}T23:00:00.000Z`, observations, {
        sessionCalendar: dates,
      }),
    );
    expect(result.status).toBe("ok");
    expect(result.value).toBeCloseTo(expected, 10);
    expect(result.unit).toBe("pct_annualized");
    expect(result.featureKey).toBe(FEATURE_DEFINITIONS.equity_rv_20.featureKey);
  });

  it("returns unavailable when the consecutive window is incomplete", () => {
    const dates = tradingDates(10);
    const observations = dates.map((date, i) =>
      obs({
        id: `p${i}`,
        seriesKey: SERIES_KEYS.SPY,
        value: 100 + i,
        unit: "price",
        observationDate: date,
        observationAt: availableAfterClose(date),
        availableAt: availableAfterClose(date),
      }),
    );
    const end = dates[dates.length - 1]!;
    const result = computeEquityRealizedVol20(
      request(`${end}T23:00:00.000Z`, observations, {
        sessionCalendar: dates,
      }),
    );
    expect(result.status).toBe("unavailable");
    expect(result.value).toBeNull();
    expect(result.reasonCode).toBe("insufficient_history");
  });

  it("rejects when an interior session in the trailing calendar is unavailable", () => {
    const fullDates = tradingDates(EQUITY_RV_SESSIONS + 1);
    const withHole = fullDates.map((date, i) => {
      if (i === 10) {
        return obs({
          id: `hole`,
          seriesKey: SERIES_KEYS.SPY,
          value: 110,
          unit: "price",
          observationDate: date,
          observationAt: availableAfterClose(date),
          availableAt: "2099-01-01T00:00:00.000Z",
        });
      }
      return obs({
        id: `p${i}`,
        seriesKey: SERIES_KEYS.SPY,
        value: 100 + i,
        unit: "price",
        observationDate: date,
        observationAt: availableAfterClose(date),
        availableAt: availableAfterClose(date),
      });
    });
    const end = fullDates[fullDates.length - 1]!;
    const result = computeEquityRealizedVol20(
      request(`${end}T23:00:00.000Z`, withHole, {
        sessionCalendar: fullDates,
      }),
    );
    expect(result.status).toBe("unavailable");
    expect(result.value).toBeNull();
    expect(result.reasonCode).toBe("incomplete_window");
  });

  it("does not use future sessions beyond the cutoff", () => {
    const dates = tradingDates(EQUITY_RV_SESSIONS + 1);
    const observations = dates.map((date, i) =>
      obs({
        id: `p${i}`,
        seriesKey: SERIES_KEYS.SPY,
        value: 100 + i,
        unit: "price",
        observationDate: date,
        observationAt: availableAfterClose(date),
        availableAt: availableAfterClose(date),
      }),
    );
    const end = dates[dates.length - 1]!;
    const cutoff = `${end}T23:00:00.000Z`;
    const baseline = computeEquityRealizedVol20(
      request(cutoff, observations, { sessionCalendar: dates }),
    );
    const leaked = computeEquityRealizedVol20(
      request(
        cutoff,
        [
          ...observations,
          obs({
            id: "future",
            seriesKey: SERIES_KEYS.SPY,
            value: 999,
            unit: "price",
            observationDate: "2099-02-01",
            observationAt: "2099-02-01T21:00:00.000Z",
            availableAt: "2099-02-01T21:00:00.000Z",
          }),
        ],
        { sessionCalendar: dates },
      ),
    );
    expect(leaked).toEqual(baseline);
  });

  it("rejects non-price units", () => {
    const dates = tradingDates(EQUITY_RV_SESSIONS + 1);
    const observations = dates.map((date, i) =>
      obs({
        id: `p${i}`,
        seriesKey: SERIES_KEYS.SPY,
        value: 100 + i,
        unit: "index_points",
        observationDate: date,
        observationAt: availableAfterClose(date),
        availableAt: availableAfterClose(date),
      }),
    );
    const end = dates[dates.length - 1]!;
    const result = computeEquityRealizedVol20(
      request(`${end}T23:00:00.000Z`, observations, {
        sessionCalendar: dates,
      }),
    );
    expect(result.status).toBe("invalid_input");
    expect(result.value).toBeNull();
    expect(result.reasonCode).toBe("invalid_unit");
  });
});

describe("PR #16 review regressions", () => {
  it("1. quarantines conflicting duplicates known at the same cutoff", () => {
    const cutoff = at("2024-06-15T12:00:00.000Z");
    const indexed = indexSeriesByObservationDate(
      [
        obs({
          id: "a",
          seriesKey: SERIES_KEYS.VIXCLS,
          value: 12,
          unit: "index_points",
          observationDate: "2024-06-14",
          observationAt: "2024-06-14T21:00:00.000Z",
          availableAt: "2024-06-14T21:00:00.000Z",
        }),
        obs({
          id: "b",
          seriesKey: SERIES_KEYS.VIXCLS,
          value: 99,
          unit: "index_points",
          observationDate: "2024-06-14",
          observationAt: "2024-06-14T21:00:00.000Z",
          availableAt: "2024-06-14T21:00:00.000Z",
        }),
      ],
      SERIES_KEYS.VIXCLS,
      { cutoff, knowledgeMode: MODE },
    );
    expect(indexed.byDate.has("2024-06-14")).toBe(false);
    expect(indexed.conflicts).toEqual([
      { observationDate: "2024-06-14", observationIds: ["a", "b"] },
    ]);

    const result = computeVixLevel(
      request("2024-06-15T12:00:00.000Z", [
        obs({
          id: "old",
          seriesKey: SERIES_KEYS.VIXCLS,
          value: 10,
          unit: "index_points",
          observationDate: "2024-06-13",
          observationAt: "2024-06-13T21:00:00.000Z",
          availableAt: "2024-06-13T21:00:00.000Z",
        }),
        obs({
          id: "dup-a",
          seriesKey: SERIES_KEYS.VIXCLS,
          value: 12,
          unit: "index_points",
          observationDate: "2024-06-14",
          observationAt: "2024-06-14T21:00:00.000Z",
          availableAt: "2024-06-14T21:00:00.000Z",
        }),
        obs({
          id: "dup-b",
          seriesKey: SERIES_KEYS.VIXCLS,
          value: 99,
          unit: "index_points",
          observationDate: "2024-06-14",
          observationAt: "2024-06-14T21:00:00.000Z",
          availableAt: "2024-06-14T21:00:00.000Z",
        }),
      ]),
    );
    expect(result.status).toBe("unavailable");
    expect(result.value).toBeNull();
    expect(result.reasonCode).toBe("conflict_quarantined");
  });

  it("1b. frozen-cutoff: future duplicate unknown at cutoff does not change result", () => {
    const cutoff = "2024-06-15T12:00:00.000Z";
    const known = obs({
      id: "known",
      seriesKey: SERIES_KEYS.VIXCLS,
      value: 14,
      unit: "index_points",
      observationDate: "2024-06-14",
      observationAt: "2024-06-14T21:00:00.000Z",
      availableAt: "2024-06-14T21:00:00.000Z",
      fetchedAt: "2024-06-14T22:00:00.000Z",
    });
    const baseline = computeVixLevel(request(cutoff, [known]));
    expect(baseline.status).toBe("ok");
    expect(baseline.value).toBe(14);

    const withFutureDup = computeVixLevel(
      request(cutoff, [
        known,
        obs({
          id: "future-dup",
          seriesKey: SERIES_KEYS.VIXCLS,
          value: 99,
          unit: "index_points",
          observationDate: "2024-06-14",
          observationAt: "2024-06-14T21:00:00.000Z",
          // Not available until after the frozen cutoff.
          availableAt: "2024-06-16T00:00:00.000Z",
          fetchedAt: "2024-06-16T01:00:00.000Z",
        }),
      ]),
    );
    expect(withFutureDup).toEqual(baseline);

    const replayBaseline = computeVixLevel(
      request(cutoff, [known], { knowledgeMode: "SYSTEM_REPLAY" }),
    );
    const replayWithLateFetch = computeVixLevel(
      request(
        cutoff,
        [
          known,
          obs({
            id: "late-fetch-dup",
            seriesKey: SERIES_KEYS.VIXCLS,
            value: 88,
            unit: "index_points",
            observationDate: "2024-06-14",
            observationAt: "2024-06-14T21:00:00.000Z",
            availableAt: "2024-06-14T21:00:00.000Z",
            // Publicly available, but not known to the system yet at cutoff.
            fetchedAt: "2024-06-16T00:00:00.000Z",
          }),
        ],
        { knowledgeMode: "SYSTEM_REPLAY" },
      ),
    );
    expect(replayWithLateFetch).toEqual(replayBaseline);
    expect(replayBaseline.value).toBe(14);
  });

  it("2. requires an independent session calendar and does not compress missing source rows", () => {
    const calendar = tradingDates(EQUITY_RV_SESSIONS + 1);
    // Drop one interior source row while keeping it on the calendar.
    const missing = calendar[10]!;
    const observations = calendar
      .filter((date) => date !== missing)
      .map((date, i) =>
        obs({
          id: `p${i}`,
          seriesKey: SERIES_KEYS.SPY,
          value: 100 + i,
          unit: "price",
          observationDate: date,
          observationAt: availableAfterClose(date),
          availableAt: availableAfterClose(date),
        }),
      );
    const end = calendar[calendar.length - 1]!;
    const withoutCalendar = computeEquityRealizedVol20(
      request(`${end}T23:00:00.000Z`, observations),
    );
    expect(withoutCalendar.status).toBe("invalid_input");
    expect(withoutCalendar.reasonCode).toBe("missing_session_calendar");

    const withCalendar = computeEquityRealizedVol20(
      request(`${end}T23:00:00.000Z`, observations, {
        sessionCalendar: calendar,
      }),
    );
    expect(withCalendar.status).toBe("unavailable");
    expect(withCalendar.value).toBeNull();
    expect(withCalendar.reasonCode).toBe("incomplete_window");
    expect(withCalendar.detail).toContain(missing);
  });

  it("3. enforces fetchedAt < cutoff in SYSTEM_REPLAY mode", () => {
    const cutoff = "2024-06-15T12:00:00.000Z";
    const row = obs({
      id: "v1",
      seriesKey: SERIES_KEYS.VIXCLS,
      value: 16,
      unit: "index_points",
      observationDate: "2024-06-14",
      observationAt: "2024-06-14T21:00:00.000Z",
      availableAt: "2024-06-14T21:00:00.000Z",
      fetchedAt: "2024-06-16T00:00:00.000Z",
    });

    expect(
      marketObservationIneligibilityReasons(
        row,
        at(cutoff),
        "SYSTEM_REPLAY",
      ),
    ).toContain("not_known_to_system");

    const late = computeVixLevel(
      request(cutoff, [row], { knowledgeMode: "SYSTEM_REPLAY" }),
    );
    expect(late.status).toBe("unavailable");
    expect(late.value).toBeNull();

    const missingFetchRow = obs({
      id: "v2",
      seriesKey: SERIES_KEYS.VIXCLS,
      value: 16,
      unit: "index_points",
      observationDate: "2024-06-14",
      observationAt: "2024-06-14T21:00:00.000Z",
      availableAt: "2024-06-14T21:00:00.000Z",
      fetchedAt: null,
    });
    expect(
      marketObservationIneligibilityReasons(
        missingFetchRow,
        at(cutoff),
        "SYSTEM_REPLAY",
      ),
    ).toContain("not_known_to_system");
    const missingFetch = computeVixLevel(
      request(cutoff, [missingFetchRow], { knowledgeMode: "SYSTEM_REPLAY" }),
    );
    expect(missingFetch.status).toBe("unavailable");
    expect(missingFetch.value).toBeNull();

    const ok = computeVixLevel(
      request(
        cutoff,
        [
          obs({
            id: "v3",
            seriesKey: SERIES_KEYS.VIXCLS,
            value: 16,
            unit: "index_points",
            observationDate: "2024-06-14",
            observationAt: "2024-06-14T21:00:00.000Z",
            availableAt: "2024-06-14T21:00:00.000Z",
            fetchedAt: "2024-06-14T22:00:00.000Z",
          }),
        ],
        { knowledgeMode: "SYSTEM_REPLAY" },
      ),
    );
    expect(ok.status).toBe("ok");
    expect(ok.value).toBe(16);

    // Public reconstruction still ignores fetchedAt.
    const publicMode = computeVixLevel(request(cutoff, [row]));
    expect(publicMode.status).toBe("ok");
    expect(publicMode.value).toBe(16);
  });

  it("4. rejects impossible observation dates", () => {
    expect(isValidObservationDate("2024-02-30")).toBe(false);
    expect(isValidObservationDate("2024-13-01")).toBe(false);
    expect(isValidObservationDate("2024-02-29")).toBe(true); // leap year
    expect(isValidObservationDate("2023-02-29")).toBe(false);

    const result = computeVixLevel(
      request("2024-06-15T12:00:00.000Z", [
        obs({
          id: "bad-date",
          seriesKey: SERIES_KEYS.VIXCLS,
          value: 11,
          unit: "index_points",
          observationDate: "2024-02-30",
          observationAt: "2024-02-28T21:00:00.000Z",
          availableAt: "2024-02-28T21:00:00.000Z",
        }),
      ]),
    );
    expect(result.status).toBe("unavailable");
    expect(result.value).toBeNull();
    expect(
      marketObservationIneligibilityReasons(
        obs({
          id: "bad-date",
          seriesKey: SERIES_KEYS.VIXCLS,
          value: 11,
          unit: "index_points",
          observationDate: "2024-02-30",
          observationAt: "2024-02-28T21:00:00.000Z",
          availableAt: "2024-02-28T21:00:00.000Z",
        }),
        at("2024-06-15T12:00:00.000Z"),
      ),
    ).toContain("impossible_observation_date");
  });

  it("5. rejects RV windows with fewer than two returns", () => {
    const dates = tradingDates(2);
    const observations = dates.map((date, i) =>
      obs({
        id: `p${i}`,
        seriesKey: SERIES_KEYS.SPY,
        value: 100 + i,
        unit: "price",
        observationDate: date,
        observationAt: availableAfterClose(date),
        availableAt: availableAfterClose(date),
      }),
    );
    const end = dates[dates.length - 1]!;
    const result = computeEquityRealizedVol20(
      request(`${end}T23:00:00.000Z`, observations, {
        sessionCalendar: dates,
      }),
      { sessions: 1 },
    );
    expect(result.status).toBe("invalid_input");
    expect(result.value).toBeNull();
    expect(result.reasonCode).toBe("insufficient_returns");
  });
});
