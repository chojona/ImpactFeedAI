import { describe, expect, it } from "vitest";

import { buildSessionCalendar } from "@/services/market/sessionCalendar";
import {
  resolveIntradayMeasurement,
  resolveSessionMeasurements,
} from "@/services/events/reactionMeasurement";
import type { PriceBasis } from "@/types/market";

const DAYS = [
  "2025-07-01", "2025-07-02", "2025-07-03",
  // 2025-07-04 is a holiday — absent, so it is not a session.
  "2025-07-07", "2025-07-08", "2025-07-09", "2025-07-10", "2025-07-11",
  "2025-07-14",
];
const calendar = buildSessionCalendar(DAYS);

/** Yahoo stamps daily bars at the session open; close is a separate field. */
const daily = (day: string, close: number) => ({
  sessionDay: day,
  barAt: new Date(`${day}T13:30:00Z`),
  close,
});

const SERIES = DAYS.map((d, i) => daily(d, 100 + i));

const base = {
  symbol: "SPY",
  calendar,
  daily: SERIES,
  priceBasis: "SPLIT_ADJUSTED" as const,
};

describe("resolveSessionMeasurements", () => {
  it("anchors a pre-market release on the prior session close", () => {
    // 2025-07-03 08:30 EDT = 12:30Z.
    const out = resolveSessionMeasurements({
      ...base,
      releaseAt: new Date("2025-07-03T12:30:00Z"),
    });
    expect(out.status).toBe("resolved");
    if (out.status !== "resolved") return;

    const release = out.measurements.find((m) => m.measure === "RELEASE_SESSION");
    expect(release).toMatchObject({
      anchorKind: "PRIOR_SESSION_CLOSE",
      anchorSessionDay: "2025-07-02",
      anchorPrice: 101,
      endpointSessionDay: "2025-07-03",
      endpointPrice: 102,
      releaseSessionDay: "2025-07-03",
    });
  });

  it("offsets SESSION_PLUS_1 and SESSION_PLUS_5 by trading sessions, skipping the holiday", () => {
    const out = resolveSessionMeasurements({
      ...base,
      releaseAt: new Date("2025-07-03T12:30:00Z"),
    });
    if (out.status !== "resolved") throw new Error("expected resolved");

    // Release session index 2; +1 skips Jul 4 to Jul 7; +5 lands on Jul 11.
    expect(
      out.measurements.find((m) => m.measure === "SESSION_PLUS_1"),
    ).toMatchObject({ endpointSessionDay: "2025-07-07", anchorPrice: 101 });
    expect(
      out.measurements.find((m) => m.measure === "SESSION_PLUS_5"),
    ).toMatchObject({ endpointSessionDay: "2025-07-11" });
  });

  it("shares one anchor across all three session measures", () => {
    const out = resolveSessionMeasurements({
      ...base,
      releaseAt: new Date("2025-07-03T12:30:00Z"),
    });
    if (out.status !== "resolved") throw new Error("expected resolved");
    const anchors = new Set(
      out.measurements.map((m) => `${m.anchorSessionDay}:${m.anchorPrice}`),
    );
    expect(anchors.size).toBe(1);
  });

  it("computes pctChange from the stored prices", () => {
    const out = resolveSessionMeasurements({
      ...base,
      releaseAt: new Date("2025-07-03T12:30:00Z"),
    });
    if (out.status !== "resolved") throw new Error("expected resolved");
    const m = out.measurements.find((x) => x.measure === "RELEASE_SESSION")!;
    expect(m.pctChange).toBeCloseTo(((102 - 101) / 101) * 100, 10);
  });

  it("emits NO row for an endpoint session beyond the series", () => {
    const short = { ...base, daily: SERIES.slice(0, 4) };
    const out = resolveSessionMeasurements({
      ...short,
      releaseAt: new Date("2025-07-03T12:30:00Z"),
    });
    if (out.status !== "resolved") throw new Error("expected resolved");
    // Absence is no row — never a placeholder with a null price.
    expect(out.measurements.map((m) => m.measure)).toEqual([
      "RELEASE_SESSION",
      "SESSION_PLUS_1",
    ]);
  });

  it("refuses an undeclared symbol", () => {
    const out = resolveSessionMeasurements({
      ...base,
      symbol: "NVDA",
      releaseAt: new Date("2025-07-03T12:30:00Z"),
    });
    expect(out).toMatchObject({ status: "refused", reason: "undeclared_symbol" });
  });

  it("refuses when the anchor session close is not strictly before the release", () => {
    // 2025-07-07 17:30 EDT = 21:30Z: after the 20:00Z equity close, so the
    // release session is Jul 8 and the anchor session is Jul 7 itself. For a
    // CONTINUOUS_24_7 instrument Jul 7 does not close until ~23:00Z.
    const out = resolveSessionMeasurements({
      ...base,
      symbol: "BTC-USD",
      releaseAt: new Date("2025-07-07T21:30:00Z"),
    });
    expect(out).toMatchObject({
      status: "refused",
      reason: "anchor_not_pre_release",
    });
  });

  it("accepts the same after-hours release for a US_EQUITY_RTH instrument", () => {
    const out = resolveSessionMeasurements({
      ...base,
      symbol: "SPY",
      releaseAt: new Date("2025-07-07T21:30:00Z"),
    });
    expect(out.status).toBe("resolved");
  });

  it("refuses a release timestamped exactly at the close", () => {
    // The anchor session's close equals releaseAt, so it is not strictly before.
    const out = resolveSessionMeasurements({
      ...base,
      releaseAt: new Date("2025-07-07T20:00:00Z"),
    });
    expect(out).toMatchObject({
      status: "refused",
      reason: "anchor_not_pre_release",
    });
  });

  it("emits no rows when the release session is the first in the series", () => {
    const out = resolveSessionMeasurements({
      ...base,
      releaseAt: new Date("2025-07-01T12:30:00Z"),
    });
    expect(out).toMatchObject({ status: "refused", reason: "no_anchor_session" });
  });

  it("rejects a non-positive or non-finite provider price", () => {
    const bad = {
      ...base,
      daily: SERIES.map((b) =>
        b.sessionDay === "2025-07-02" ? { ...b, close: 0 } : b,
      ),
    };
    const out = resolveSessionMeasurements({
      ...bad,
      releaseAt: new Date("2025-07-03T12:30:00Z"),
    });
    expect(out).toMatchObject({ status: "refused", reason: "unusable_anchor_price" });
  });
});

const hourly = (
  iso: string,
  open: number | null,
  priceBasis: PriceBasis = "AS_TRADED",
) => ({
  barAt: new Date(iso),
  open,
  priceBasis,
});

const intradayBase = {
  symbol: "SPY",
  releaseSessionDay: "2025-07-03",
};

describe("resolveIntradayMeasurement", () => {
  it("anchors on the last bar opening strictly before the release", () => {
    const out = resolveIntradayMeasurement({
      ...intradayBase,
      releaseAt: new Date("2025-07-03T12:30:00Z"),
      intraday: [
        hourly("2025-07-03T12:00:00Z", 100),
        hourly("2025-07-03T13:30:00Z", 102),
      ],
    });
    expect(out.status).toBe("resolved");
    if (out.status !== "resolved") return;
    expect(out.measurements[0]).toMatchObject({
      measure: "INTRADAY_60M",
      anchorKind: "PRE_RELEASE_INTRADAY_BAR",
      anchorPrice: 100,
      anchorBarAt: new Date("2025-07-03T12:00:00Z"),
      endpointPrice: 102,
      endpointBarAt: new Date("2025-07-03T13:30:00Z"),
      priceBasis: "AS_TRADED",
    });
    expect(out.measurements[0].pctChange).toBeCloseTo(2, 10);
  });

  it("rejects a bar at exactly the release instant as an anchor", () => {
    const out = resolveIntradayMeasurement({
      ...intradayBase,
      releaseAt: new Date("2025-07-03T12:30:00Z"),
      intraday: [
        hourly("2025-07-03T12:30:00Z", 100),
        hourly("2025-07-03T13:30:00Z", 102),
      ],
    });
    expect(out).toMatchObject({ status: "refused", reason: "no_intraday_anchor" });
  });

  it("rejects a stale anchor older than two hours", () => {
    const out = resolveIntradayMeasurement({
      ...intradayBase,
      releaseAt: new Date("2025-07-03T12:30:00Z"),
      intraday: [
        hourly("2025-07-03T10:00:00Z", 100),
        hourly("2025-07-03T13:30:00Z", 102),
      ],
    });
    expect(out).toMatchObject({ status: "refused", reason: "no_intraday_anchor" });
  });

  it("rejects an endpoint beyond the slip window", () => {
    // Target 13:30Z; the next bar is the following morning.
    const out = resolveIntradayMeasurement({
      ...intradayBase,
      releaseAt: new Date("2025-07-03T12:30:00Z"),
      intraday: [
        hourly("2025-07-03T12:00:00Z", 100),
        hourly("2025-07-07T13:30:00Z", 102),
      ],
    });
    expect(out).toMatchObject({ status: "refused", reason: "no_intraday_endpoint" });
  });

  it("tolerates one missing bar inside the slip window", () => {
    const out = resolveIntradayMeasurement({
      ...intradayBase,
      releaseAt: new Date("2025-07-03T12:30:00Z"),
      intraday: [
        hourly("2025-07-03T12:00:00Z", 100),
        hourly("2025-07-03T14:30:00Z", 103),
      ],
    });
    expect(out.status).toBe("resolved");
  });

  it("skips unusable opens without borrowing another field", () => {
    const out = resolveIntradayMeasurement({
      ...intradayBase,
      releaseAt: new Date("2025-07-03T12:30:00Z"),
      intraday: [
        hourly("2025-07-03T12:00:00Z", 100),
        hourly("2025-07-03T13:30:00Z", null),
        hourly("2025-07-03T14:00:00Z", 105),
      ],
    });
    if (out.status !== "resolved") throw new Error("expected resolved");
    expect(out.measurements[0].endpointPrice).toBe(105);
  });

  it("refuses an undeclared symbol", () => {
    const out = resolveIntradayMeasurement({
      ...intradayBase,
      symbol: "NVDA",
      releaseAt: new Date("2025-07-03T12:30:00Z"),
      intraday: [
        hourly("2025-07-03T12:00:00Z", 100),
        hourly("2025-07-03T13:30:00Z", 102),
      ],
    });
    expect(out).toMatchObject({ status: "refused", reason: "undeclared_symbol" });
  });

  it("is unaffected by the daily series' basis — XLK/XLE are never suppressed", () => {
    // resolveIntradayMeasurement has no daily-series input at all: XLK's
    // SPLIT_ADJUSTED daily series cannot reach this function, so it cannot
    // suppress an otherwise-valid AS_TRADED intraday reading. This is the
    // exact case the v2 cross-series guard wrongly rejected — see spec §15.2.
    const out = resolveIntradayMeasurement({
      ...intradayBase,
      symbol: "XLK",
      releaseAt: new Date("2025-07-03T12:30:00Z"),
      intraday: [
        hourly("2025-07-03T12:00:00Z", 232.89, "AS_TRADED"),
        hourly("2025-07-03T13:30:00Z", 234.0, "AS_TRADED"),
      ],
    });
    expect(out.status).toBe("resolved");
  });

  it("rejects a single measurement that would combine mismatched bases", () => {
    const out = resolveIntradayMeasurement({
      ...intradayBase,
      releaseAt: new Date("2025-07-03T12:30:00Z"),
      intraday: [
        hourly("2025-07-03T12:00:00Z", 100, "AS_TRADED"),
        hourly("2025-07-03T13:30:00Z", 102, "SPLIT_ADJUSTED"),
      ],
    });
    expect(out).toMatchObject({ status: "refused", reason: "mixed_price_basis" });
  });
});
