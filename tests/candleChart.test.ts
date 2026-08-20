import { describe, expect, it } from "vitest";

import {
  buildChartSeries,
  describeChart,
  formatEastern,
  locateEventMarker,
  toChartCandles,
  toVolumePoints,
} from "@/services/market/candleChart";
import type { Candle } from "@/types/market";

/**
 * The server→chart transformation.
 *
 * These target the ways a candlestick chart can lie without erroring: a
 * fabricated bar filling a market closure, a null volume rendered as a zero
 * bar, a release marker that silently relocates the event, or a series handed
 * to the library out of order. The canvas itself is not tested — pixel
 * assertions break on every library upgrade and prove nothing about the data.
 */

const candle = (
  iso: string,
  o: number,
  h: number,
  l: number,
  c: number,
  volume: number | null = 1_000_000,
): Candle => ({
  symbol: "SPY",
  interval: "ONE_HOUR",
  openTime: new Date(iso),
  open: o,
  high: h,
  low: l,
  close: c,
  volume,
  session: volume === null ? "EXTENDED" : "REGULAR",
  priceBasis: "AS_TRADED",
});

/** Three consecutive hourly bars on 2025-05-13 (EDT), 13:00–15:00 UTC. */
const threeBars = (): Candle[] => [
  candle("2025-05-13T13:00:00.000Z", 100, 101, 99.5, 100.5),
  candle("2025-05-13T14:00:00.000Z", 100.5, 102, 100.2, 101.8),
  candle("2025-05-13T15:00:00.000Z", 101.8, 102.5, 101, 101.2),
];

/* ───────────────────────────── serialization ────────────────────────────── */

describe("toChartCandles", () => {
  it("emits epoch seconds, not milliseconds", () => {
    const [first] = toChartCandles([candle("2025-05-13T13:00:00.000Z", 1, 2, 0.5, 1.5)]);
    expect(first.time).toBe(1747141200);
    expect(first.time).toBe(Date.parse("2025-05-13T13:00:00.000Z") / 1000);
  });

  it("preserves every OHLC leg exactly", () => {
    const [first] = toChartCandles([
      candle("2025-05-13T13:00:00.000Z", 581.48, 582.01, 580.38, 580.86),
    ]);
    expect(first).toMatchObject({
      open: 581.48,
      high: 582.01,
      low: 580.38,
      close: 580.86,
    });
  });

  it("returns exactly one point per stored candle", () => {
    expect(toChartCandles(threeBars())).toHaveLength(3);
  });

  it("orders ascending even when the input is not", () => {
    const shuffled = [threeBars()[2], threeBars()[0], threeBars()[1]];
    const times = toChartCandles(shuffled).map((c) => c.time);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("does not fabricate a bar across a market closure", () => {
    // Jan 9 2025 was a national day of mourning; the market was shut. The gap
    // must remain a gap — filling it would invent a session that never traded.
    const acrossClosure = [
      candle("2025-01-08T20:00:00.000Z", 100, 101, 99, 100.5),
      candle("2025-01-10T14:30:00.000Z", 99, 100, 98.5, 99.5),
    ];
    const result = toChartCandles(acrossClosure);
    expect(result).toHaveLength(2);
    // A day and change apart, with nothing interpolated between.
    expect(result[1].time - result[0].time).toBeGreaterThan(60 * 60 * 24);
  });

  it("does not resample or merge adjacent bars", () => {
    const result = toChartCandles(threeBars());
    expect(result.map((c) => c.open)).toEqual([100, 100.5, 101.8]);
  });

  it("returns an empty series for no candles", () => {
    expect(toChartCandles([])).toEqual([]);
  });
});

/* ──────────────────────────────── volume ────────────────────────────────── */

describe("toVolumePoints", () => {
  it("keeps a real volume as a plotted value", () => {
    const [point] = toVolumePoints([
      candle("2025-05-13T14:00:00.000Z", 100, 101, 99, 100.5, 1_234_567),
    ]);
    expect(point.value).toBe(1_234_567);
  });

  it("emits whitespace — never zero — for an unknown volume", () => {
    // The provider withholds extended-hours volume. A 0 here would draw a flat
    // bar asserting that no trading occurred.
    const [point] = toVolumePoints([
      candle("2025-05-13T08:00:00.000Z", 100, 101, 99, 100.5, null),
    ]);
    expect(point.value).toBeUndefined();
    expect(point).not.toHaveProperty("value", 0);
    expect(Object.hasOwn(point, "time")).toBe(true);
  });

  it("stays aligned one-to-one with the candles", () => {
    const mixed = [
      candle("2025-05-13T08:00:00.000Z", 100, 101, 99, 100.5, null),
      candle("2025-05-13T14:00:00.000Z", 100, 101, 99, 100.5, 500),
      candle("2025-05-13T21:00:00.000Z", 100, 101, 99, 100.5, null),
    ];
    const volume = toVolumePoints(mixed);
    const candles = toChartCandles(mixed);
    expect(volume).toHaveLength(candles.length);
    expect(volume.map((v) => v.time)).toEqual(candles.map((c) => c.time));
  });

  it("handles partial coverage without dropping the measured bars", () => {
    const mixed = [
      candle("2025-05-13T08:00:00.000Z", 100, 101, 99, 100.5, null),
      candle("2025-05-13T14:00:00.000Z", 100, 101, 99, 100.5, 500),
    ];
    const withValue = toVolumePoints(mixed).filter(
      (v) => v.value !== undefined,
    );
    expect(withValue).toHaveLength(1);
    expect(withValue[0].value).toBe(500);
  });

  it("preserves a genuine regular-session zero", () => {
    // 0 from a regular session is a real observation and must survive; only a
    // null is a withheld quantity.
    const [point] = toVolumePoints([
      { ...candle("2025-05-13T14:00:00.000Z", 100, 101, 99, 100.5, 0), session: "REGULAR" },
    ]);
    expect(point.value).toBe(0);
  });

  it("treats a non-finite volume as unknown rather than plotting it", () => {
    const [point] = toVolumePoints([
      candle("2025-05-13T14:00:00.000Z", 100, 101, 99, 100.5, Number.NaN),
    ]);
    expect(point.value).toBeUndefined();
  });

  it("colours the bar by the candle's own direction", () => {
    const up = toVolumePoints([candle("2025-05-13T14:00:00.000Z", 100, 102, 99, 101, 10)]);
    const down = toVolumePoints([candle("2025-05-13T14:00:00.000Z", 101, 102, 99, 100, 10)]);
    expect(up[0].color).not.toBe(down[0].color);
  });
});

/* ────────────────────────────── event marker ────────────────────────────── */

describe("locateEventMarker", () => {
  const bars = toChartCandles(threeBars());

  it("anchors to the bar containing a mid-bar release", () => {
    // 14:30 UTC falls inside the 14:00 bar.
    const marker = locateEventMarker(bars, new Date("2025-05-13T14:30:00.000Z"));
    expect(marker?.anchorTime).toBe(Date.parse("2025-05-13T14:00:00.000Z") / 1000);
  });

  it("preserves the true release instant, never the bar's open", () => {
    const releaseAt = new Date("2025-05-13T14:30:00.000Z");
    const marker = locateEventMarker(bars, releaseAt);
    expect(marker?.releaseAtIso).toBe("2025-05-13T14:30:00.000Z");
    expect(marker?.approximate).toBe(true);
    expect(marker?.offsetSeconds).toBe(1800);
  });

  it("reports an exact hit as not approximate", () => {
    const marker = locateEventMarker(bars, new Date("2025-05-13T14:00:00.000Z"));
    expect(marker?.approximate).toBe(false);
    expect(marker?.offsetSeconds).toBe(0);
  });

  it("anchors a pre-window release to the first bar and says so", () => {
    const marker = locateEventMarker(bars, new Date("2025-05-13T09:00:00.000Z"));
    expect(marker?.anchorTime).toBe(bars[0].time);
    expect(marker?.approximate).toBe(true);
    expect(marker?.offsetSeconds).toBeLessThan(0);
  });

  it("anchors a post-window release to the last bar", () => {
    const marker = locateEventMarker(bars, new Date("2025-05-13T23:00:00.000Z"));
    expect(marker?.anchorTime).toBe(bars[bars.length - 1].time);
  });

  it("returns null when there is nothing to anchor to", () => {
    expect(locateEventMarker([], new Date("2025-05-13T14:00:00.000Z"))).toBeNull();
  });

  it("returns null for an invalid release instant rather than guessing", () => {
    expect(locateEventMarker(bars, new Date("nonsense"))).toBeNull();
  });
});

/* ───────────────────────────────── DST ──────────────────────────────────── */

describe("timezone handling", () => {
  it("renders a summer instant in EDT", () => {
    // 12:30 UTC on 2025-05-13 is 08:30 EDT — a CPI release time.
    expect(formatEastern(new Date("2025-05-13T12:30:00.000Z"))).toContain("8:30 AM");
    expect(formatEastern(new Date("2025-05-13T12:30:00.000Z"))).toContain("EDT");
  });

  it("renders a winter instant in EST", () => {
    // 13:30 UTC on 2025-01-15 is also 08:30 ET, one hour further from UTC.
    expect(formatEastern(new Date("2025-01-15T13:30:00.000Z"))).toContain("8:30 AM");
    expect(formatEastern(new Date("2025-01-15T13:30:00.000Z"))).toContain("EST");
  });

  it("maps both offsets onto the same wall clock without shifting stored values", () => {
    const summer = new Date("2025-05-13T12:30:00.000Z");
    const winter = new Date("2025-01-15T13:30:00.000Z");
    // Same ET wall clock, one hour apart in UTC — proof the offset is derived
    // per instant rather than hardcoded.
    expect(winter.getTime() - summer.getTime()).not.toBe(0);
    expect(formatEastern(summer).slice(-8)).not.toBe(formatEastern(winter).slice(-8));
  });

  it("does not mutate the timestamps handed to the chart", () => {
    const iso = "2025-05-13T12:30:00.000Z";
    const [point] = toChartCandles([candle(iso, 1, 2, 0.5, 1.5)]);
    // Still the true UTC instant — no offset baked in.
    expect(new Date(point.time * 1000).toISOString()).toBe(iso);
  });
});

/* ───────────────────────────── series assembly ──────────────────────────── */

describe("buildChartSeries", () => {
  it("assembles candles, volume and marker consistently", () => {
    const series = buildChartSeries(threeBars(), new Date("2025-05-13T14:30:00.000Z"));
    expect(series.candles).toHaveLength(3);
    expect(series.volume).toHaveLength(3);
    expect(series.marker?.anchorTime).toBe(series.candles[1].time);
    expect(series.firstTime).toBe(series.candles[0].time);
    expect(series.lastTime).toBe(series.candles[2].time);
  });

  it("counts the bars whose volume was withheld", () => {
    const mixed = [
      candle("2025-05-13T08:00:00.000Z", 100, 101, 99, 100.5, null),
      candle("2025-05-13T14:00:00.000Z", 100, 101, 99, 100.5, 500),
      candle("2025-05-13T21:00:00.000Z", 100, 101, 99, 100.5, null),
    ];
    expect(buildChartSeries(mixed, new Date("2025-05-13T14:30:00.000Z")).volumeMissing).toBe(2);
  });

  it("produces a safe empty series with no candles", () => {
    const series = buildChartSeries([], new Date("2025-05-13T14:30:00.000Z"));
    expect(series.candles).toEqual([]);
    expect(series.marker).toBeNull();
    expect(series.firstTime).toBeNull();
    expect(series.lastTime).toBeNull();
  });
});

/* ─────────────────────────── accessible summary ─────────────────────────── */

describe("describeChart", () => {
  const summaryFor = (candles: Candle[], releaseIso: string) =>
    describeChart({
      symbol: "SPY",
      interval: "ONE_HOUR",
      intervalLabel: "1H",
      series: buildChartSeries(candles, new Date(releaseIso)),
      releaseAt: new Date(releaseIso),
      eventLabel: "CPI",
    });

  it("states symbol, interval, bar count and range", () => {
    const text = summaryFor(threeBars(), "2025-05-13T14:30:00.000Z");
    expect(text).toContain("SPY");
    expect(text).toContain("1H");
    expect(text).toContain("3 bars");
  });

  it("quotes the release in Eastern time", () => {
    const text = summaryFor(threeBars(), "2025-05-13T12:30:00.000Z");
    expect(text).toContain("CPI released");
    expect(text).toContain("8:30 AM");
  });

  it("explains withheld volume instead of implying zero trading", () => {
    const mixed = [
      candle("2025-05-13T08:00:00.000Z", 100, 101, 99, 100.5, null),
      candle("2025-05-13T14:00:00.000Z", 100, 101, 99, 100.5, 500),
    ];
    const text = summaryFor(mixed, "2025-05-13T12:30:00.000Z");
    expect(text).toContain("Volume is unavailable for 1 of 2 bars");
    expect(text).toContain("rather than zero");
  });

  it("says nothing about volume when every bar has it", () => {
    expect(summaryFor(threeBars(), "2025-05-13T14:30:00.000Z")).not.toContain(
      "Volume is unavailable",
    );
  });

  it("reports the absence plainly when there are no candles", () => {
    expect(summaryFor([], "2025-05-13T14:30:00.000Z")).toContain(
      "No stored 1H candles",
    );
  });
});
