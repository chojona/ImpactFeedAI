import { describe, expect, it } from "vitest";

import { buildSessionCalendar } from "@/services/market/sessionCalendar";
import { resolveSessionMeasurements } from "@/services/events/reactionMeasurement";

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
