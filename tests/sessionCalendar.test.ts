import { describe, expect, it } from "vitest";

import { buildSessionCalendar } from "@/services/market/sessionCalendar";

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
