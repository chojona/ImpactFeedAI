import { describe, expect, it, vi } from "vitest";
import { verifyMeasurementDataset, type VerificationRow, type VerificationEvent } from "@/services/events/measurementCoverage";
import { checkInvariants } from "@/services/events/measurementVerification";

const days = ["2025-03-06", "2025-03-07", "2025-03-10", "2025-03-11", "2025-03-12", "2025-03-13", "2025-03-14"];
const event: VerificationEvent = { id: "event", releaseAt: new Date("2025-03-07T13:30:00Z"), timingStatus: "VERIFIED", timingSource: "official source" };
const row: VerificationRow = { id: "row", eventId: event.id, symbol: "SPY", measure: "RELEASE_SESSION", anchorKind: "PRIOR_SESSION_CLOSE", anchorPrice: 100, endpointPrice: 101, pctChange: 1, anchorBarAt: new Date("2025-03-06T14:30:00Z"), endpointBarAt: new Date("2025-03-07T14:30:00Z"), anchorSessionDay: days[0], releaseSessionDay: days[1], endpointSessionDay: days[1], priceBasis: "SPLIT_ADJUSTED", sessionBasis: "US_EQUITY_RTH" };
const rows: VerificationRow[] = [row,
  { ...row, id: "plus1", measure: "SESSION_PLUS_1", endpointSessionDay: days[2], endpointBarAt: new Date("2025-03-10T13:30:00Z") },
  { ...row, id: "plus5", measure: "SESSION_PLUS_5", endpointSessionDay: days[6], endpointBarAt: new Date("2025-03-14T13:30:00Z") },
  { ...row, id: "hour", measure: "INTRADAY_60M", anchorKind: "PRE_RELEASE_INTRADAY_BAR", anchorSessionDay: days[1], anchorBarAt: new Date("2025-03-07T13:00:00Z"), endpointBarAt: new Date("2025-03-07T14:30:00Z"), priceBasis: "AS_TRADED" },
];
const input = { events: [event], symbols: ["SPY"], rows, fetchCalendar: vi.fn(async () => ({ status: "ok" as const, days })) };
const ctx = { releaseAt: event.releaseAt!, sessionDays: days, isEarlyClose: () => false };

describe("strict source-event coverage", () => {
  it("accepts complete, coherent fixtures but does not claim PIT certification", async () => {
    const report = await verifyMeasurementDataset(input);
    expect(report.passed).toBe(true);
    expect(report.summary).toMatchObject({ expected: 4, observed: 4, valid: 4, invalid: 0, incomplete: 0, missing: 0 });
    expect(report.pointInTimeCertified).toBe(false);
  });
  it("detects an event with ALL measurements deleted", async () => {
    const report = await verifyMeasurementDataset({ ...input, events: [event, { ...event, id: "deleted" }] });
    expect(report.summary.expected).toBe(8);
    expect(report.summary.missing).toBe(4);
    expect(report.passed).toBe(false);
  });
  it("does not treat an absent first-hour row as legitimately unavailable", async () => {
    const report = await verifyMeasurementDataset({ ...input, rows: rows.slice(0, 3) });
    expect(report.summary).toMatchObject({ missing: 1, legitimatelyUnavailable: 0, unresolvedAvailability: 1 });
    expect(report.passed).toBe(false);
  });
  it("detects duplicate combinations even without a database unique constraint", async () => {
    const report = await verifyMeasurementDataset({ ...input, rows: [...rows, { ...row, id: "duplicate" }] });
    expect(report.summary).toMatchObject({ duplicateRows: 1, invalid: 2 });
    expect(report.passed).toBe(false);
  });
  it("detects extra instruments and undeclared calendar assumptions", async () => {
    const report = await verifyMeasurementDataset({ ...input, rows: [...rows, { ...row, id: "extra", symbol: "UNKNOWN" }] });
    expect(report.summary.unexpected).toBe(1);
    expect(report.diagnostics.some(d => d.code === "symbol_session_basis_mismatch")).toBe(true);
  });
  it("does not certify a generic futures close as an authoritative calendar", async () => {
    const report = await verifyMeasurementDataset({ ...input, symbols: ["GC=F"], rows: rows.map(r => ({ ...r, symbol: "GC=F", sessionBasis: "EXTENDED_FUTURES" })) });
    expect(report.summary).toMatchObject({ invalid: 3, valid: 1 });
    expect(report.diagnostics.filter(d => d.code === "unsupported_native_calendar")).toHaveLength(3);
  });
  it.each([null, new Date(NaN)])("rejects missing/invalid release %s without passing unchecked rows", async releaseAt => {
    const report = await verifyMeasurementDataset({ ...input, events: [{ ...event, releaseAt }] });
    expect(report.passed).toBe(false);
    expect(report.summary).toMatchObject({ eligibleEvents: 0, valid: 0, incomplete: 0, invalid: 4, unchecked: 4 });
  });
  it.each(["", " ", null])("rejects incomplete timing provenance %s", async timingSource => {
    expect((await verifyMeasurementDataset({ ...input, events: [{ ...event, timingSource }] })).passed).toBe(false);
  });
  it("rejects untrusted timing statuses", async () => {
    const report = await verifyMeasurementDataset({ ...input, events: [{ ...event, timingStatus: "UNVERIFIED" }] });
    expect(report.summary.unexpected).toBe(4);
    expect(report.passed).toBe(false);
  });
  it.each(["failed", "empty", "thrown"])("fails complete verification if calendar is %s", async mode => {
    const fetchCalendar = async () => {
      if (mode === "thrown") throw new Error("provider unavailable");
      return mode === "empty" ? { status: "ok" as const, days: [] } : { status: "failed" as const, reason: "provider unavailable" };
    };
    const report = await verifyMeasurementDataset({ ...input, fetchCalendar });
    expect(report.passed).toBe(false);
    expect(report.summary).toMatchObject({ checked: 0, incomplete: 4, valid: 0 });
  });
  it("fails zero coverage and still derives the expected grid", async () => {
    const report = await verifyMeasurementDataset({ ...input, rows: [] });
    expect(report.summary).toMatchObject({ expected: 4, missing: 4, observed: 0 });
    expect(report.passed).toBe(false);
    expect((await verifyMeasurementDataset({ ...input, events: [], rows: [] })).passed).toBe(false);
  });
});

describe("additional row-level corruptions", () => {
  it("rejects a mutually consistent but wrong origin and adjacent sessions", () => {
    const shifted = { ...row, anchorSessionDay: days[1], anchorBarAt: new Date("2025-03-07T14:30:00Z"), releaseSessionDay: days[2], endpointSessionDay: days[2], endpointBarAt: new Date("2025-03-10T13:30:00Z") };
    expect(checkInvariants(shifted, ctx)).toContain("release_session_mismatch");
  });
  it.each(["anchorBarAt", "endpointBarAt"])("rejects invalid %s", field => {
    expect(checkInvariants({ ...row, [field]: new Date(NaN) }, ctx)).toContain("invalid_timestamp");
  });
  it("rejects invalid reaction-window names at runtime", () => {
    expect(checkInvariants({ ...row, measure: "ONE_WEEK" as VerificationRow["measure"] }, ctx)).toContain("invalid_measure");
  });
  it("rejects stale intraday anchors and inconsistent session labels", () => {
    expect(checkInvariants({ ...rows[3], anchorBarAt: new Date("2025-03-07T10:00:00Z"), anchorSessionDay: days[0] }, ctx)).toEqual(expect.arrayContaining(["intraday_anchor_too_old", "intraday_session_labels_mismatch"]));
  });
  it("rejects delayed availability at the decision timestamp", () => {
    expect(checkInvariants({ ...row, anchorAvailableAt: event.releaseAt! }, ctx)).toContain("anchor_not_available_before_release");
  });
  it("rejects malformed and impossible session labels without throwing", () => {
    for (const anchorSessionDay of ["garbage", "2025-02-30"]) expect(checkInvariants({ ...row, anchorSessionDay }, ctx)).toContain("non_canonical_session_day");
  });
  it("rejects provider daily labels inconsistent with bar stamps", () => {
    expect(checkInvariants({ ...row, anchorBarAt: new Date("2025-03-07T14:30:00Z") }, ctx)).toContain("daily_bar_session_mismatch");
  });
  it("refuses unsupported years instead of assuming full calendar knowledge", () => {
    expect(checkInvariants(row, { ...ctx, earlyCloseKnown: () => false })).toContain("unsupported_calendar_range");
  });
  it("rejects nonfinite arithmetic rather than letting NaN comparisons pass", () => {
    expect(checkInvariants({ ...row, endpointPrice: NaN }, ctx)).toContain("pct_change_inconsistent");
  });
});
