import { describe, expect, it } from "vitest";

import {
  buildCoverageReport,
  createTradingCalendar,
  isGlobexActiveMinute,
  isUsMarketHoliday,
  sessionMinuteCount,
  tradingDateForReleaseAt,
} from "@/services/market/nqArchive";

import { bar, edtSessionBars } from "./fixtures/nqArchive/helpers";

const resolve = (iso: string, dates?: readonly string[]) =>
  tradingDateForReleaseAt(
    new Date(iso),
    dates ? createTradingCalendar(dates) : null,
  );

describe("tradingDateForReleaseAt (F13)", () => {
  it("maps a weekday 08:30 ET release to that date via the heuristic", () => {
    expect(resolve("2024-06-12T12:30:00.000Z")).toEqual({
      tradingDate: "2024-06-12",
      basis: "heuristic_fallback",
      refusalReason: null,
    });
  });

  it("assigns the 17:00–18:00 ET break to the next session", () => {
    expect(resolve("2024-06-10T20:59:00.000Z").tradingDate).toBe("2024-06-10");
    expect(resolve("2024-06-10T21:00:00.000Z").tradingDate).toBe("2024-06-11");
    expect(resolve("2024-06-10T21:30:00.000Z").tradingDate).toBe("2024-06-11");
    expect(resolve("2024-06-10T22:00:00.000Z").tradingDate).toBe("2024-06-11");
  });

  it("assigns Friday evening and the weekend to Monday", () => {
    expect(resolve("2024-06-14T20:59:00.000Z").tradingDate).toBe("2024-06-14");
    expect(resolve("2024-06-14T23:00:00.000Z").tradingDate).toBe("2024-06-17");
    expect(resolve("2024-06-15T15:00:00.000Z").tradingDate).toBe("2024-06-17");
    expect(resolve("2024-06-16T22:00:00.000Z").tradingDate).toBe("2024-06-17");
  });

  it("uses the certification calendar for Sunday evening before a holiday Monday", () => {
    const calendar = ["2024-01-11", "2024-01-12", "2024-01-16", "2024-01-17"];
    expect(resolve("2024-01-14T23:30:00.000Z", calendar)).toEqual({
      tradingDate: "2024-01-16",
      basis: "certification_calendar",
      refusalReason: null,
    });
  });

  it("refuses the heuristic for holiday-adjacent dates", () => {
    const sundayBeforeMlk = resolve("2024-01-14T23:30:00.000Z");
    expect(sundayBeforeMlk.tradingDate).toBe("2024-01-15");
    expect(sundayBeforeMlk.refusalReason).toBe("HOLIDAY_ADJACENT_TRADING_DATE");
    // Day after Thanksgiving and the eve of Independence Day.
    expect(resolve("2024-11-29T15:00:00.000Z").refusalReason).toBe(
      "HOLIDAY_ADJACENT_TRADING_DATE",
    );
    expect(resolve("2024-07-03T13:00:00.000Z").refusalReason).toBe(
      "HOLIDAY_ADJACENT_TRADING_DATE",
    );
  });

  it("maps Thanksgiving-morning Globex trading to Friday via the calendar", () => {
    const calendar = ["2024-11-26", "2024-11-27", "2024-11-29", "2024-12-02"];
    expect(resolve("2024-11-28T15:00:00.000Z", calendar).tradingDate).toBe(
      "2024-11-29",
    );
  });

  it("falls back to the heuristic outside the calendar's span", () => {
    const result = resolve("2024-06-12T12:30:00.000Z", ["2024-01-02", "2024-01-03"]);
    expect(result.basis).toBe("heuristic_fallback");
    expect(result.tradingDate).toBe("2024-06-12");
  });

  it("refuses pre-2012 dates", () => {
    expect(resolve("2011-06-15T12:30:00.000Z").refusalReason).toBe(
      "PRE_2012_TRADING_DATE_UNSUPPORTED",
    );
    expect(
      resolve("2011-06-15T12:30:00.000Z", ["2011-06-14", "2011-06-15"])
        .refusalReason,
    ).toBe("PRE_2012_TRADING_DATE_UNSUPPORTED");
  });

  it("handles DST-transition Sunday evenings", () => {
    // 2024-03-10: clocks spring forward, 18:00 EDT = 22:00 UTC.
    expect(resolve("2024-03-10T21:30:00.000Z").tradingDate).toBe("2024-03-11");
    expect(resolve("2024-03-10T22:30:00.000Z").tradingDate).toBe("2024-03-11");
    // 2024-11-03: clocks fall back, 18:00 EST = 23:00 UTC.
    expect(resolve("2024-11-03T22:30:00.000Z").tradingDate).toBe("2024-11-04");
    expect(resolve("2024-11-03T23:30:00.000Z").tradingDate).toBe("2024-11-04");
  });

  it("rejects a non-finite instant", () => {
    expect(() => tradingDateForReleaseAt(new Date(Number.NaN))).toThrow(
      TypeError,
    );
  });
});

describe("isGlobexActiveMinute (F6)", () => {
  const active = (iso: string) => isGlobexActiveMinute(new Date(iso));

  it("excludes the daily 17:00–18:00 ET maintenance break", () => {
    expect(active("2024-06-12T20:59:00.000Z")).toBe(true);
    expect(active("2024-06-12T21:00:00.000Z")).toBe(false);
    expect(active("2024-06-12T21:59:00.000Z")).toBe(false);
    expect(active("2024-06-12T22:00:00.000Z")).toBe(true);
  });

  it("excludes Friday 17:00 ET through Sunday 18:00 ET", () => {
    expect(active("2024-06-14T21:00:00.000Z")).toBe(false);
    expect(active("2024-06-15T15:00:00.000Z")).toBe(false);
    expect(active("2024-06-16T21:59:00.000Z")).toBe(false);
    expect(active("2024-06-16T22:00:00.000Z")).toBe(true);
  });

  it("follows the Sunday open across both DST transitions", () => {
    expect(active("2024-03-10T21:59:00.000Z")).toBe(false);
    expect(active("2024-03-10T22:00:00.000Z")).toBe(true);
    expect(active("2024-11-03T22:00:00.000Z")).toBe(false);
    expect(active("2024-11-03T22:59:00.000Z")).toBe(false);
    expect(active("2024-11-03T23:00:00.000Z")).toBe(true);
  });
});

describe("sessionMinuteCount (F6)", () => {
  it("counts 23 hours for regular sessions, including DST Mondays", () => {
    for (const date of [
      "2024-06-12",
      "2024-06-17",
      "2024-03-08",
      "2024-03-11",
      "2024-11-04",
    ]) {
      expect(sessionMinuteCount(date, null)).toBe(1380);
    }
  });

  it("folds a calendar holiday's Globex hours into the next session", () => {
    const calendar = createTradingCalendar([
      "2024-01-12",
      "2024-01-16",
      "2024-01-17",
    ]);
    expect(sessionMinuteCount("2024-01-16", calendar)).toBe(2760);
  });
});

describe("isUsMarketHoliday", () => {
  it("knows rule-based and observed holidays", () => {
    expect(isUsMarketHoliday("2024-01-15")).toBe(true); // MLK
    expect(isUsMarketHoliday("2024-03-29")).toBe(true); // Good Friday
    expect(isUsMarketHoliday("2024-06-19")).toBe(true); // Juneteenth
    expect(isUsMarketHoliday("2021-06-18")).toBe(false); // pre-Juneteenth rule
    expect(isUsMarketHoliday("2021-12-24")).toBe(true); // Christmas observed
    expect(isUsMarketHoliday("2022-12-26")).toBe(true); // Christmas observed
    expect(isUsMarketHoliday("2026-07-03")).toBe(true); // July 4 observed
    expect(isUsMarketHoliday("2024-06-12")).toBe(false);
  });
});

describe("buildCoverageReport session grid (F6)", () => {
  it("does not expect bars inside the maintenance break", () => {
    const coverage = buildCoverageReport({
      windowStart: new Date("2024-06-12T20:30:00.000Z"),
      windowEnd: new Date("2024-06-12T22:30:00.000Z"),
      selectedContract: "NQM24",
      bars: edtSessionBars({
        contract: "NQM24",
        startIso: "2024-06-12T20:30:00.000Z",
        endIso: "2024-06-12T22:30:00.000Z",
      }),
    });
    expect(coverage.expectedBars).toBe(61);
    expect(coverage.excludedClosedMinutes).toBe(60);
    expect(coverage.complete).toBe(true);
  });

  it("lists duplicate and out-of-session minutes", () => {
    const coverage = buildCoverageReport({
      windowStart: new Date("2024-06-12T20:58:00.000Z"),
      windowEnd: new Date("2024-06-12T21:01:00.000Z"),
      selectedContract: "NQM24",
      bars: [
        bar("2024-06-12T20:58:00.000Z"),
        bar("2024-06-12T20:59:00.000Z"),
        bar("2024-06-12T20:59:00.000Z", { close: 100.5 }),
        bar("2024-06-12T21:00:00.000Z"),
      ],
    });
    expect(coverage.duplicateOpenAts.map((d) => d.toISOString())).toEqual([
      "2024-06-12T20:59:00.000Z",
    ]);
    expect(coverage.unexpectedOpenAts.map((d) => d.toISOString())).toEqual([
      "2024-06-12T21:00:00.000Z",
    ]);
    expect(coverage.complete).toBe(false);
  });
});
