import { describe, expect, it } from "vitest";
import hours from "./fixtures/nyse-hours.json";
import { buildSessionCalendar, resolveReleaseSession } from "@/services/market/sessionCalendar";
import { economicCloseInstant } from "@/services/market/sessionBasis";
import { resolveSessionMeasurements, resolveIntradayMeasurement } from "@/services/events/reactionMeasurement";
import { COMPUTED_REACTION_CALCULATION_VERSION, CURRENT_REACTION_CALCULATION_VERSION } from "@/services/events/timing";

const bar = (day: string) => ({ sessionDay: day, barAt: new Date(`${day}T13:30:00Z`), close: 100 });

describe("official NYSE schedule regressions", () => {
  it.each(hours.earlyCloses)("retains the source-listed half-day %s", day => {
    const calendar = buildSessionCalendar([day]);
    expect(calendar.isEarlyClose(day)).toBe(true);
    expect(calendar.closeInstant(day, { honourEarlyClose: true }).getTime()).toBeLessThan(calendar.closeInstant(day).getTime());
  });
  it.each(hours.regularCloses)("does not turn $day into a half-day or use its future close", c => {
    const calendar = buildSessionCalendar([c.previous, c.day, c.next]);
    const releaseAt = new Date(c.release);
    expect(calendar.isEarlyClose(c.day)).toBe(false);
    expect(calendar.closeInstant(c.day, { honourEarlyClose: true })).toEqual(new Date(c.close));
    expect(resolveReleaseSession(calendar, releaseAt)).toMatchObject({ status: "resolved", day: c.day });
    const input = { symbol: "SPY", calendar, releaseAt, daily: [c.previous, c.day, c.next].map(bar), priceBasis: "SPLIT_ADJUSTED" as const };
    const result = resolveSessionMeasurements(input);
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") throw new Error("expected resolved");
    expect(result.measurements.length).toBeGreaterThan(0);
    for (const m of result.measurements) {
      expect(m.anchorSessionDay).toBe(c.previous);
      expect(economicCloseInstant({ basis: m.sessionBasis, sessionDay: m.anchorSessionDay, barAt: m.anchorBarAt, isEarlyClose: false }).getTime()).toBeLessThan(releaseAt.getTime());
    }
    // Reproduce the audit's missing-prior-bar case: no later substitute.
    expect(resolveSessionMeasurements({ ...input, daily: [c.day, c.next].map(bar) })).toEqual({ status: "refused", reason: "unusable_anchor_price" });
  });
  it("does not let an old out-of-range session poison a covered release", () => {
    expect(resolveReleaseSession(buildSessionCalendar(["2021-12-31", "2022-01-03"]), new Date("2022-01-03T19:00:00Z"))).toMatchObject({ status: "resolved", day: "2022-01-03" });
  });
  it("writes a new calculation version without an unreviewed read cutover", () => {
    expect(COMPUTED_REACTION_CALCULATION_VERSION).toBe(4);
    expect(CURRENT_REACTION_CALCULATION_VERSION).toBe(3);
  });
});

describe("economic completion versus availability", () => {
  const days = ["2025-03-07", "2025-03-10", "2025-03-11", "2025-03-12", "2025-03-13", "2025-03-14", "2025-03-17"];
  const calendar = buildSessionCalendar(days);
  const daily = days.map(bar);
  const input = { symbol: "SPY", calendar, daily, priceBasis: "SPLIT_ADJUSTED" as const, releaseAt: new Date("2025-03-10T12:30:00Z") };
  it.each(["SPY", "GC=F", "BTC-USD"])("asserts every selected %s anchor completion strictly precedes release across DST", symbol => {
    const result = resolveSessionMeasurements({ ...input, symbol, daily: days.map(day => ({ ...bar(day), barAt: new Date(`${day}T00:00:00Z`) })) });
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") throw new Error("expected resolved");
    for (const m of result.measurements) expect(economicCloseInstant({ basis: m.sessionBasis, sessionDay: m.anchorSessionDay, barAt: m.anchorBarAt, isEarlyClose: false }).getTime()).toBeLessThan(input.releaseAt.getTime());
  });
  it.each(["2025-03-10T12:30:00Z", "2025-03-10T12:31:00Z"])("rejects delayed daily availability at %s", available => {
    expect(resolveSessionMeasurements({ ...input, daily: daily.map(b => ({ ...b, availableAt: new Date(available) })) })).toEqual({ status: "refused", reason: "anchor_not_pre_release" });
  });
  it("rejects evidence claiming the close was available before completion", () => {
    expect(resolveSessionMeasurements({ ...input, daily: daily.map(b => ({ ...b, availableAt: b.barAt })) })).toEqual({ status: "refused", reason: "anchor_availability_invalid" });
  });
  it("rejects invalid daily bar timestamps and invalid release dates", () => {
    expect(resolveSessionMeasurements({ ...input, daily: daily.map(b => ({ ...b, barAt: new Date(NaN) })) })).toMatchObject({ status: "refused", reason: "invalid_anchor_timestamp" });
    expect(resolveSessionMeasurements({ ...input, releaseAt: new Date(NaN) })).toMatchObject({ status: "refused", reason: "invalid_release_timestamp" });
  });
  it("does not use an intraday open whose evidenced availability is at release", () => {
    expect(resolveIntradayMeasurement({ symbol: "SPY", releaseAt: input.releaseAt, releaseSessionDay: "2025-03-10", intraday: [
      { barAt: new Date("2025-03-10T12:00:00Z"), open: 100, availableAt: input.releaseAt, priceBasis: "AS_TRADED" },
      { barAt: new Date("2025-03-10T13:30:00Z"), open: 101, priceBasis: "AS_TRADED" },
    ] })).toMatchObject({ status: "refused", reason: "no_intraday_anchor" });
  });
  it.each(["2025-11-03T13:30:00Z", "2025-11-01T15:00:00Z"])("handles fall DST and weekend release %s", at => {
    const cal = buildSessionCalendar(["2025-10-31", "2025-11-03", "2025-11-04"]);
    expect(resolveReleaseSession(cal, new Date(at))).toMatchObject({ status: "resolved", day: "2025-11-03" });
    expect(cal.closeInstant("2025-10-31")).toEqual(new Date("2025-10-31T20:00:00Z"));
    expect(cal.closeInstant("2025-11-03")).toEqual(new Date("2025-11-03T21:00:00Z"));
  });
});
