import { describe, expect, it } from "vitest";

import {
  easternWallClock,
  fomcStatementTime,
  usDataReleaseTime,
  utcDateOnly,
} from "@/services/macro/time";

/**
 * Eastern wall clock → UTC.
 *
 * Regression for a hardcoded `-05:00` offset in the bulk ingestion sources.
 * Every release between March and November was stamped an hour late, which moved
 * the anchor the price pipeline measures reactions from — a 14:00 EDT Fed
 * decision was anchored on the 15:00 candle, attributing the whole first hour of
 * the reaction to the wrong window.
 */
describe("easternWallClock", () => {
  it("uses UTC−5 in winter (EST)", () => {
    expect(usDataReleaseTime("2025-01-15").toISOString()).toBe(
      "2025-01-15T13:30:00.000Z",
    );
  });

  it("uses UTC−4 in summer (EDT)", () => {
    // The old hardcoded offset produced 13:30Z here — an hour late.
    expect(usDataReleaseTime("2025-06-11").toISOString()).toBe(
      "2025-06-11T12:30:00.000Z",
    );
  });

  it("stamps an FOMC statement at 14:00 ET on both sides of the DST boundary", () => {
    // 2022-11-02 was still EDT; DST ended on the 6th.
    expect(fomcStatementTime("2022-11-02").toISOString()).toBe(
      "2022-11-02T18:00:00.000Z",
    );
    // 2024-11-07 was EST; DST had ended on the 3rd.
    expect(fomcStatementTime("2024-11-07").toISOString()).toBe(
      "2024-11-07T19:00:00.000Z",
    );
  });

  it("supports 10:00 ET releases in both EST and EDT", () => {
    expect(easternWallClock("2025-01-15", 10, 0).toISOString()).toBe(
      "2025-01-15T15:00:00.000Z",
    );
    expect(easternWallClock("2025-06-11", 10, 0).toISOString()).toBe(
      "2025-06-11T14:00:00.000Z",
    );
  });

  it("handles the spring-forward transition day", () => {
    // DST began 2025-03-09 at 02:00 local; 08:30 is already EDT.
    expect(usDataReleaseTime("2025-03-09").toISOString()).toBe(
      "2025-03-09T12:30:00.000Z",
    );
    // The day before is still EST.
    expect(usDataReleaseTime("2025-03-08").toISOString()).toBe(
      "2025-03-08T13:30:00.000Z",
    );
  });

  it("handles the fall-back transition day", () => {
    // DST ended 2025-11-02 at 02:00 local; 08:30 is EST.
    expect(usDataReleaseTime("2025-11-02").toISOString()).toBe(
      "2025-11-02T13:30:00.000Z",
    );
    expect(usDataReleaseTime("2025-11-01").toISOString()).toBe(
      "2025-11-01T12:30:00.000Z",
    );
  });

  it("returns an invalid Date for an unparseable day, preserving caller guards", () => {
    expect(Number.isNaN(easternWallClock("not-a-date", 8, 30).getTime())).toBe(
      true,
    );
    expect(Number.isNaN(easternWallClock("2025-6-1", 8, 30).getTime())).toBe(
      true,
    );
    expect(Number.isNaN(easternWallClock("2025-02-29", 8, 30).getTime())).toBe(
      true,
    );
    expect(Number.isNaN(easternWallClock("2025-04-31", 8, 30).getTime())).toBe(
      true,
    );
    expect(Number.isNaN(easternWallClock("2025-01-01", 24, 0).getTime())).toBe(
      true,
    );
    expect(Number.isNaN(easternWallClock("2025-01-01", 10, 60).getTime())).toBe(
      true,
    );
  });

  it("round-trips back to the requested wall-clock time in New York", () => {
    for (const day of [
      "2020-01-01",
      "2020-07-01",
      "2024-03-10",
      "2024-11-03",
      "2026-08-10",
    ]) {
      const instant = easternWallClock(day, 8, 30);
      const local = instant.toLocaleString("en-US", {
        timeZone: "America/New_York",
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
      });
      expect(local).toBe("08:30");
    }
  });
});

describe("utcDateOnly", () => {
  it("preserves a weekend reference date without inventing a business day", () => {
    const reference = utcDateOnly("2025-06-01"); // Sunday
    expect(reference.toISOString()).toBe("2025-06-01T00:00:00.000Z");
    expect(reference.getUTCDay()).toBe(0);
  });

  it("accepts a real leap day and rejects normalized calendar overflow", () => {
    expect(utcDateOnly("2024-02-29").toISOString()).toBe(
      "2024-02-29T00:00:00.000Z",
    );
    expect(Number.isNaN(utcDateOnly("2023-02-29").getTime())).toBe(true);
  });
});
