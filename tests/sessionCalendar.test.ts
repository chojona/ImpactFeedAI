import { describe, expect, it } from "vitest";

import {
  buildSessionCalendar,
  resolveReleaseSession,
} from "@/services/market/sessionCalendar";

// Real SPY session days around the 2025 Independence Day early close.
const DAYS = [
  "2025-06-30", "2025-07-01", "2025-07-02", "2025-07-03",
  // 2025-07-04 is a holiday — absent, so it is not a session.
  "2025-07-07", "2025-07-08", "2025-07-09", "2025-07-10", "2025-07-11",
];

describe("buildSessionCalendar", () => {
  const cal = buildSessionCalendar(DAYS);

  it("treats a date with no reference bar as a non-session", () => {
    expect(cal.indexOf("2025-07-04")).toBeNull();
    expect(cal.indexOf("2025-07-03")).toBe(3);
  });

  it("walks sessions by ordinal, skipping holidays", () => {
    expect(cal.dayAt(cal.indexOf("2025-07-03")! + 1)).toBe("2025-07-07");
  });

  it("returns null past the end of the series rather than extrapolating", () => {
    expect(cal.dayAt(DAYS.length)).toBeNull();
    expect(cal.dayAt(-1)).toBeNull();
  });

  it("deduplicates and sorts the reference series", () => {
    const unsorted = buildSessionCalendar(["2025-07-03", "2025-07-01", "2025-07-01"]);
    expect(unsorted.sessionDays).toEqual(["2025-07-01", "2025-07-03"]);
  });

  it("resolves a regular close at 16:00 ET, DST-correct", () => {
    // 2025-07-03 is EDT (UTC-4): 16:00 ET = 20:00Z.
    expect(cal.closeInstant("2025-07-03")).toEqual(
      new Date("2025-07-03T20:00:00Z"),
    );
  });

  it("resolves an early close at 13:00 ET from the table, only when honoured", () => {
    expect(cal.isEarlyClose("2025-07-03")).toBe(true);
    expect(cal.closeInstant("2025-07-03", { honourEarlyClose: true })).toEqual(
      new Date("2025-07-03T17:00:00Z"),
    );
    // Without the flag, the regular close is returned even on a listed day.
    expect(cal.closeInstant("2025-07-03")).toEqual(
      new Date("2025-07-03T20:00:00Z"),
    );
  });

  it("is DST-correct in winter", () => {
    const winter = buildSessionCalendar(["2025-01-15"]);
    // EST (UTC-5): 16:00 ET = 21:00Z.
    expect(winter.closeInstant("2025-01-15")).toEqual(
      new Date("2025-01-15T21:00:00Z"),
    );
  });

  it("reports whether a date is inside the curated early-close range", () => {
    expect(cal.earlyCloseKnown("2025-07-03")).toBe(true);
    expect(cal.earlyCloseKnown("2021-07-03")).toBe(false);
    expect(cal.earlyCloseKnown("2027-07-03")).toBe(false);
  });
});

describe("resolveReleaseSession", () => {
  const WEEK = [
    "2025-03-06", "2025-03-07",
    // 2025-03-08 Sat, 2025-03-09 Sun (DST starts) — not sessions.
    "2025-03-10", "2025-03-11", "2025-03-12",
  ];
  const cal = buildSessionCalendar(WEEK);

  const resolved = (at: string) => {
    const r = resolveReleaseSession(cal, new Date(at));
    if (r.status !== "resolved") throw new Error(`refused: ${r.reason}`);
    return r.day;
  };

  it("assigns a pre-market release to the same session", () => {
    // 08:30 EST on Mar 7 = 13:30Z.
    expect(resolved("2025-03-07T13:30:00Z")).toBe("2025-03-07");
  });

  it("assigns an intra-session release to the same session", () => {
    // 14:00 EST = 19:00Z, before the 21:00Z close.
    expect(resolved("2025-03-07T19:00:00Z")).toBe("2025-03-07");
  });

  it("assigns an after-hours release to the next session", () => {
    // 16:20 EST = 21:20Z, after the 21:00Z close.
    expect(resolved("2025-03-07T21:20:00Z")).toBe("2025-03-10");
  });

  it("assigns a release one millisecond after the close to the next session", () => {
    expect(resolved("2025-03-07T21:00:00.001Z")).toBe("2025-03-10");
  });

  it("assigns a release exactly at the close to the next session", () => {
    // Strictly-after means the closing instant belongs to the session that
    // just ended, so the release belongs to the following one.
    expect(resolved("2025-03-07T21:00:00.000Z")).toBe("2025-03-10");
  });

  it("assigns a weekend release to the next session, across DST", () => {
    // Sat Mar 8 00:01 EST = 05:01Z. Monday Mar 10 is EDT.
    expect(resolved("2025-03-08T05:01:00Z")).toBe("2025-03-10");
  });

  it("skips a holiday", () => {
    const holidayWeek = buildSessionCalendar(["2025-07-03", "2025-07-07"]);
    // Fri Jul 4 is absent from the reference series.
    expect(
      resolveReleaseSession(holidayWeek, new Date("2025-07-04T12:30:00Z")),
    ).toMatchObject({ status: "resolved", day: "2025-07-07" });
  });

  it("refuses when no session closes after the release", () => {
    expect(
      resolveReleaseSession(cal, new Date("2025-12-31T12:30:00Z")),
    ).toMatchObject({ status: "refused", reason: "no_session_after_release" });
  });

  it("refuses for an invalid release instant", () => {
    expect(
      resolveReleaseSession(cal, new Date(Number.NaN)),
    ).toMatchObject({ status: "refused", reason: "no_session_after_release" });
  });

  it("refuses an ambiguity-window release outside the early-close range", () => {
    // 14:00 ET on 2021-11-26 sits in [13:00, 16:00) and predates the table.
    const old = buildSessionCalendar(["2021-11-26", "2021-11-29"]);
    expect(
      resolveReleaseSession(old, new Date("2021-11-26T19:00:00Z")),
    ).toMatchObject({ status: "refused", reason: "early_close_unknown" });
  });

  it("proceeds outside the ambiguity window even out of range", () => {
    // 08:30 ET: neither a 13:00 nor a 16:00 close has passed, so the
    // early-close status cannot change the answer.
    const old = buildSessionCalendar(["2021-11-26", "2021-11-29"]);
    expect(
      resolveReleaseSession(old, new Date("2021-11-26T13:30:00Z")),
    ).toMatchObject({ status: "resolved", day: "2021-11-26" });
  });

  it("uses the early close when the date is covered", () => {
    // 2025-07-03 closes at 13:00 ET = 17:00Z; a 14:00 ET release is after it.
    const cal2 = buildSessionCalendar(["2025-07-03", "2025-07-07"]);
    expect(
      resolveReleaseSession(cal2, new Date("2025-07-03T18:00:00Z")),
    ).toMatchObject({ status: "resolved", day: "2025-07-07" });
  });

  it("is unaffected by an early-close date outside the ambiguity window", () => {
    // 2025-07-03 is a listed early-close day, but an 08:30 ET release is
    // before both the 13:00 and 16:00 boundaries, so it still resolves to the
    // same session regardless of which close time applies.
    const cal2 = buildSessionCalendar(["2025-07-03", "2025-07-07"]);
    expect(
      resolveReleaseSession(cal2, new Date("2025-07-03T12:30:00Z")),
    ).toMatchObject({ status: "resolved", day: "2025-07-03" });
  });
});
