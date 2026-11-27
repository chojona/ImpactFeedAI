import { describe, expect, it } from "vitest";
import { compareCalendarAssignments } from "../scripts/maintenance/reaction-calendar-impact";
import { planRecomputedImpact } from "../scripts/maintenance/recompute-reaction-impact";
import type { VerificationEvent, VerificationRow } from "@/services/events/measurementCoverage";
const event: VerificationEvent = { id: "release", releaseAt: new Date("2022-07-01T18:00:00Z"), timingStatus: "VERIFIED", timingSource: "official" };
const row: VerificationRow = { id: "row", eventId: "release", symbol: "SPY", measure: "RELEASE_SESSION", anchorKind: "PRIOR_SESSION_CLOSE", anchorPrice: 100, anchorBarAt: new Date("2022-07-01T13:30:00Z"), anchorSessionDay: "2022-07-01", endpointPrice: 101, endpointBarAt: new Date("2022-07-05T13:30:00Z"), endpointSessionDay: "2022-07-05", releaseSessionDay: "2022-07-05", pctChange: 1, priceBasis: "SPLIT_ADJUSTED", sessionBasis: "US_EQUITY_RTH" };
const days = ["2022-06-30", "2022-07-01", "2022-07-05"];
describe("dry-run impact gates", () => {
  it("identifies each exposed observation without mutating it", () => {
    const frozen = JSON.stringify(row);
    const report = compareCalendarAssignments({ events: [event], rows: [row], calendars: { release: { status: "ok", days } } });
    expect(report.changedObservedRows).toBe(1);
    expect(report.disputedDateExposures).toEqual(["row"]);
    expect(report.changedObservations[0].after).toMatchObject({ anchorSessionDay: "2022-06-30", releaseSessionDay: "2022-07-01" });
    expect(report.applyAuthorized).toBe(false);
    expect(JSON.stringify(row)).toBe(frozen);
  });
  it("cannot call a missing reference calendar an unchanged history", () => {
    const report = compareCalendarAssignments({ events: [event], rows: [row], calendars: {} });
    expect(report.incompleteEvents).toEqual(["release"]);
    expect(report.checkedEvents).toBe(0);
  });
  it("does not turn an unrepeatable stored measurement into a fabricated zero", () => {
    const report = planRecomputedImpact([event], [row], []);
    expect(report.removed).toBe(1);
    expect(report.changedObservations[0].after).toBeNull();
    expect(report.unresolvedChanges).toBe(1);
    expect(report.incomplete.length).toBeGreaterThan(0);
    expect(report.readCutoverAuthorized).toBe(false);
  });
});
