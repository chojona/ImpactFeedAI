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
    // release session is Jul 8 and the anchor session is Jul 7 itself. A
    // CONTINUOUS_24_7 instrument's Jul 7 bar has not closed by then — its
    // close is one UTC day after the bar's own stamp.
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

describe("continuous-market session semantics (the Stage-2 BTC defect)", () => {
  // Yahoo stamps BTC-USD daily bars at UTC midnight, so the bar stamped
  // 2025-07-03T00:00Z IS UTC day 2025-07-03 and closes at 2025-07-04T00:00Z.
  // Prices below are the real provider values for those bars.
  const btcDaily = (stamp: string, close: number) => ({
    sessionDay: stamp.slice(0, 10),
    barAt: new Date(stamp),
    close,
  });

  const BTC_NFP = [
    btcDaily("2025-07-01T00:00:00Z", 105698.28125),
    btcDaily("2025-07-02T00:00:00Z", 108859.3203125),
    btcDaily("2025-07-03T00:00:00Z", 109647.9765625),
    btcDaily("2025-07-04T00:00:00Z", 108034.3359375),
    btcDaily("2025-07-07T00:00:00Z", 108299.8515625),
    btcDaily("2025-07-08T00:00:00Z", 108950.2734375),
    btcDaily("2025-07-09T00:00:00Z", 111326.5546875),
    btcDaily("2025-07-10T00:00:00Z", 115987.203125),
    btcDaily("2025-07-11T00:00:00Z", 117516.9921875),
    btcDaily("2025-07-14T00:00:00Z", 119849.703125),
  ];

  it("anchors the June 2025 NFP on a price realised BEFORE the release", () => {
    // Release 2025-07-03T12:30Z. The anchor is UTC day 2025-07-02, whose close
    // is realised at 2025-07-03T00:00Z — 12.5h before the print.
    const out = resolveSessionMeasurements({
      symbol: "BTC-USD",
      calendar,
      daily: BTC_NFP,
      priceBasis: "SPLIT_ADJUSTED",
      releaseAt: new Date("2025-07-03T12:30:00Z"),
    });
    expect(out.status).toBe("resolved");
    if (out.status !== "resolved") return;

    const release = out.measurements.find((m) => m.measure === "RELEASE_SESSION");
    expect(release).toMatchObject({
      anchorSessionDay: "2025-07-02",
      anchorPrice: 108859.3203125,
      endpointSessionDay: "2025-07-03",
      endpointPrice: 109647.9765625,
    });
    expect(release?.pctChange).toBeCloseTo(0.7244729, 6);
  });

  it("never selects the post-release price the Eastern mapping used to pick", () => {
    // Before the fix the anchor was 109647.98 — a price not realised until
    // 2025-07-04T00:00Z, 11.5h AFTER the release, so the baseline already
    // contained the reaction it was meant to measure against.
    const out = resolveSessionMeasurements({
      symbol: "BTC-USD",
      calendar,
      daily: BTC_NFP,
      priceBasis: "SPLIT_ADJUSTED",
      releaseAt: new Date("2025-07-03T12:30:00Z"),
    });
    if (out.status !== "resolved") throw new Error("expected resolved");
    for (const m of out.measurements) {
      expect(m.anchorPrice).not.toBe(109647.9765625);
      expect(m.anchorPrice).toBe(108859.3203125);
    }
  });

  it("anchors the July 2022 CPI on a price realised BEFORE the release", () => {
    const days = [
      "2022-07-11", "2022-07-12", "2022-07-13", "2022-07-14", "2022-07-15",
      "2022-07-18", "2022-07-19", "2022-07-20", "2022-07-21",
    ];
    const cal2022 = buildSessionCalendar(days);
    const series = [
      btcDaily("2022-07-11T00:00:00Z", 19970.556640625),
      btcDaily("2022-07-12T00:00:00Z", 19323.9140625),
      btcDaily("2022-07-13T00:00:00Z", 20212.07421875),
      btcDaily("2022-07-14T00:00:00Z", 20569.919921875),
      btcDaily("2022-07-15T00:00:00Z", 20836.328125),
      btcDaily("2022-07-18T00:00:00Z", 22485.689453125),
      btcDaily("2022-07-19T00:00:00Z", 23389.43359375),
      btcDaily("2022-07-20T00:00:00Z", 23231.732421875),
      btcDaily("2022-07-21T00:00:00Z", 23164.62890625),
    ];
    const out = resolveSessionMeasurements({
      symbol: "BTC-USD",
      calendar: cal2022,
      daily: series,
      priceBasis: "SPLIT_ADJUSTED",
      releaseAt: new Date("2022-07-13T12:30:00Z"),
    });
    if (out.status !== "resolved") throw new Error("expected resolved");

    const release = out.measurements.find((m) => m.measure === "RELEASE_SESSION");
    // Was +1.77% anchored on 20212.07 (realised 11.5h AFTER the print);
    // now +4.60% anchored on 19323.91 (realised 12.5h BEFORE it).
    expect(release).toMatchObject({
      anchorSessionDay: "2022-07-12",
      anchorPrice: 19323.9140625,
      endpointPrice: 20212.07421875,
    });
    expect(release?.pctChange).toBeCloseTo(4.5961711, 6);
    expect(release?.pctChange).not.toBeCloseTo(1.770455, 5);
  });

  it("refuses when the continuous anchor bar has not closed by the release", () => {
    // Release exactly at 2025-07-03T00:00Z, the instant the Jul 2 bar closes:
    // not strictly before, so it is refused rather than used.
    const out = resolveSessionMeasurements({
      symbol: "BTC-USD",
      calendar,
      daily: BTC_NFP,
      priceBasis: "SPLIT_ADJUSTED",
      releaseAt: new Date("2025-07-03T00:00:00Z"),
    });
    expect(out).toMatchObject({
      status: "refused",
      reason: "anchor_not_pre_release",
    });
  });

  it("keeps equity and futures anchors on their own session's wall-clock close", () => {
    // Regression guard: the continuous-market fix must not leak into the
    // session-bounded bases. Both resolve against the SAME 13:30Z-stamped
    // series and must still anchor on 2025-07-02.
    for (const symbol of ["SPY", "GC=F"]) {
      const out = resolveSessionMeasurements({
        ...base,
        symbol,
        releaseAt: new Date("2025-07-03T12:30:00Z"),
      });
      if (out.status !== "resolved") throw new Error(`expected resolved for ${symbol}`);
      expect(out.measurements[0]).toMatchObject({
        anchorSessionDay: "2025-07-02",
        anchorPrice: 101,
      });
    }
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
