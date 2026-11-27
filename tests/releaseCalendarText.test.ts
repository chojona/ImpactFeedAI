import { describe, expect, it } from "vitest";
import { easternWallClock } from "@/services/macro/time";

import {
  easternInstant,
  observedEasternZone,
  parseMonthDayYear,
  parseMonthYear,
  parseQuarter,
  readClock,
  to24h,
} from "../scripts/ingest/release-calendar/text";

describe("release-calendar text parsing", () => {
  it("parses publisher date formats without overflow", () => {
    expect(parseMonthDayYear("Thursday, January 11, 2024")).toBe("2024-01-11");
    expect(parseMonthDayYear("THURSDAY, AUGUST 1, 1996")).toBe("1996-08-01");
    expect(parseMonthDayYear("Sept. 5, 2025")).toBe("2025-09-05");
    expect(parseMonthDayYear("February 30, 2024")).toBeNull();
    expect(parseMonthYear("December 2023")).toBe("2023-12-01");
    expect(parseQuarter("GDP (Advance Estimate), 3rd Quarter 2026")).toBe("2026-07-01");
    expect(parseQuarter("Gross Domestic Product, 4th Quarter and Year 2024 (Advance Estimate)")).toBe("2024-10-01");
    expect(parseQuarter("Gross Domestic Product, 2nd quarter 1996 (advance)")).toBe("1996-04-01");
  });

  it("converts 12-hour clocks including noon and midnight", () => {
    expect(to24h(12, 30, "p")).toEqual({ h: 12, m: 30 });
    expect(to24h(12, 0, "a")).toEqual({ h: 0, m: 0 });
    expect(to24h(2, 15, "p")).toEqual({ h: 14, m: 15 });
    expect(to24h(13, 0, "p")).toBeNull();
  });

  it("reads a clock and its zone label", () => {
    expect(readClock("embargoed until 8:30 a.m. (ET) Thursday")).toMatchObject({ hour: 8, minute: 30, meridiem: "a", zone: "ET" });
    expect(readClock("UNTIL 8:30 A.M. (EDT)")).toMatchObject({ zone: "EDT" });
    expect(readClock("For release at 2:00 p.m. EST")).toMatchObject({ hour: 2, meridiem: "p", zone: "EST" });
    expect(readClock("no clock here")).toBeNull();
  });

  it("is DST-correct on both sides of each 2024 transition", () => {
    // DST began 2024-03-10 and ended 2024-11-03.
    expect(easternInstant("2024-03-08", 8, 30, "a", "EST")?.releaseAt.toISOString()).toBe("2024-03-08T13:30:00.000Z");
    expect(easternInstant("2024-03-12", 8, 30, "a", "EDT")?.releaseAt.toISOString()).toBe("2024-03-12T12:30:00.000Z");
    expect(easternInstant("2024-11-01", 8, 30, "a", "EDT")?.releaseAt.toISOString()).toBe("2024-11-01T12:30:00.000Z");
    expect(easternInstant("2024-11-04", 8, 30, "a", "EST")?.releaseAt.toISOString()).toBe("2024-11-04T13:30:00.000Z");
    expect(observedEasternZone(new Date("2024-07-01T12:00:00Z"))).toBe("EDT");
  });

  it("uses the wall clock and flags, but never applies, a wrong zone label", () => {
    const r = easternInstant("2024-07-11", 8, 30, "a", "EST");
    expect(r?.releaseAt.toISOString()).toBe("2024-07-11T12:30:00.000Z");
    expect(r?.zoneLabelMismatch).toBe(true);
    expect(easternInstant("2024-07-11", 8, 30, "a", "ET")?.zoneLabelMismatch).toBe(false);
  });

  it("rejects a nonexistent spring-forward clock reading even with a printed abbreviation", () => {
    expect(easternWallClock("2024-03-10", 2, 30).getTime()).toBeNaN();
    expect(easternInstant("2024-03-10", 2, 30, "a", "EST")).toBeNull();
    expect(easternInstant("2024-03-10", 2, 30, "a", "EDT")).toBeNull();
  });

  it("requires a matching abbreviation or offset to resolve a repeated clock reading", () => {
    const day = "2024-11-03";
    expect(easternWallClock(day, 1, 30).getTime()).toBeNaN();
    expect(easternInstant(day, 1, 30, "a", "ET")).toBeNull();
    expect(easternInstant(day, 1, 30, "a", "EDT")?.releaseAt.toISOString()).toBe("2024-11-03T05:30:00.000Z");
    expect(easternInstant(day, 1, 30, "a", "EST")?.releaseAt.toISOString()).toBe("2024-11-03T06:30:00.000Z");
    const clock = readClock("embargoed until 1:30 a.m. (-05:00) Sunday");
    expect(clock?.zone).toBe("-05:00");
    expect(easternInstant(day, 1, 30, "a", clock?.zone ?? null)?.releaseAt.toISOString()).toBe("2024-11-03T06:30:00.000Z");
    expect(easternInstant(day, 1, 30, "a", "-0600")).toBeNull();
  });
});
