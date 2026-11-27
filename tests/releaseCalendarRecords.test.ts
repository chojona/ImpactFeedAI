import { describe, expect, it } from "vitest";

import { resolveHistoricalRelease } from "@/services/macro/release-calendar";
import {
  createRecordCalendarProvider,
  mergeObservations,
  type CalendarObservation,
  type TimingEvidence,
} from "@/services/macro/release-calendar-records";

const ev = (over: Partial<TimingEvidence>): TimingEvidence => ({
  providerId: "fed-fomc-statement",
  sourceName: "Fed statement",
  sourceKind: "OFFICIAL_RELEASE_RECORD",
  sourceUrl: "https://www.federalreserve.gov/newsevents/pressreleases/monetary20240131a.htm",
  retrievedAt: "2026-11-27T12:00:00.000Z",
  releaseDate: "2024-01-31",
  releaseAt: "2024-01-31T19:00:00.000Z",
  statedZone: "EST",
  evidenceText: "For release at 2:00 p.m. EST",
  contentSha256: null,
  ...over,
});

const fomc = (evidence: TimingEvidence, over: Partial<CalendarObservation> = {}): CalendarObservation => ({
  family: "FOMC_STATEMENT",
  referencePeriodStart: evidence.releaseDate,
  releaseStage: "INITIAL",
  stageLabel: null,
  unscheduled: false,
  flags: [],
  evidence,
  ...over,
});

const sffed = (releaseDate: string, releaseAt: string | null, unscheduled = false): CalendarObservation =>
  fomc(ev({
    providerId: "frbsf-bauer-swanson",
    sourceKind: "SECONDARY_RESEARCH_DATASET",
    sourceUrl: "https://www.frbsf.org/wp-content/uploads/monetary-policy-surprises-data.xlsx",
    releaseDate,
    releaseAt,
    statedZone: null,
    evidenceText: `Date=${releaseDate}`,
  }), { unscheduled });

describe("release-calendar record merging", () => {
  it("keeps an official date-only statement DATE_ONLY even when research supplies a time", () => {
    const official = fomc(ev({ releaseDate: "2008-01-22", releaseAt: null, statedZone: null,
      sourceUrl: "https://www.federalreserve.gov/newsevents/press/monetary/20080122b.htm",
      evidenceText: "page date: 2008-01-22 | For immediate release" }), { unscheduled: true });
    const [r] = mergeObservations([official, sffed("2008-01-22", "2008-01-22T13:30:00.000Z", true)]);
    expect(r.timingStatus).toBe("DATE_ONLY");
    expect(r.releaseAt).toBeNull();
    expect(r.flags).toEqual(expect.arrayContaining(["SECONDARY_TIME_ONLY", "UNSCHEDULED"]));
    expect(r.evidence).toHaveLength(2);
  });

  it("verifies an official instant and records agreeing research without conflict", () => {
    const [r] = mergeObservations([fomc(ev({})), sffed("2024-01-31", "2024-01-31T19:00:00.000Z")]);
    expect(r).toMatchObject({ timingStatus: "VERIFIED", releaseAt: "2024-01-31T19:00:00.000Z", timePrecision: "MINUTE" });
    expect(r.flags).not.toContain("TIME_CONFLICT");
  });

  it("flags disagreeing research and the contract provider then withholds the record", async () => {
    const records = mergeObservations([fomc(ev({})), sffed("2024-01-31", "2024-01-31T19:15:00.000Z")]);
    expect(records[0].flags).toContain("TIME_CONFLICT");
    const provider = createRecordCalendarProvider(records);
    const res = await resolveHistoricalRelease(provider, {
      metricKey: "FED_TARGET_UPPER", referencePeriodStart: "2024-01-31", releaseStage: "INITIAL" });
    expect(res).toBeNull();
  });

  it("never projects research-only timing onto the contract", async () => {
    const records = mergeObservations([sffed("1990-07-13", "1990-07-13T15:30:00.000Z")]);
    expect(records[0].timingStatus).toBe("SECONDARY_ONLY");
    const res = await resolveHistoricalRelease(createRecordCalendarProvider(records), {
      metricKey: "FED_TARGET_UPPER", referencePeriodStart: "1990-07-13", releaseStage: "INITIAL" });
    expect(res).toBeNull();
  });

  it("prefers a release record over the schedule and flags a reschedule", () => {
    const base = { family: "BEA_GDP" as const, referencePeriodStart: "2025-07-01", releaseStage: "ADVANCE" as const,
      stageLabel: "Advance", unscheduled: null, flags: [] };
    const schedule: CalendarObservation = { ...base, evidence: ev({ providerId: "bea-release-schedule-ics",
      sourceKind: "OFFICIAL_SCHEDULE", sourceUrl: "https://www.bea.gov/news/schedule/ics/online-calendar-subscription.ics",
      releaseDate: "2025-10-30", releaseAt: "2025-10-30T12:30:00.000Z", statedZone: "UTC", evidenceText: "DTSTART:20251030T123000Z" }) };
    const record: CalendarObservation = { ...base, evidence: ev({ providerId: "bea-news-release",
      sourceUrl: "https://www.bea.gov/news/2025/gdp-advance-estimate-3rd-quarter-2025",
      releaseDate: "2025-12-23", releaseAt: "2025-12-23T13:30:00.000Z", statedZone: "EST",
      evidenceText: "EMBARGOED UNTIL RELEASE AT 8:30 a.m. EST, Tuesday, December 23, 2025" }) };
    const [r] = mergeObservations([schedule, record]);
    expect(r).toMatchObject({ timingStatus: "VERIFIED", releaseDate: "2025-12-23" });
    expect(r.flags).toEqual(expect.arrayContaining(["SCHEDULE_DIFFERS_FROM_RECORD", "DATE_CONFLICT"]));
  });

  it("projects a schedule-only release as SCHEDULED through the existing validator", async () => {
    const obs: CalendarObservation = { family: "BEA_PERSONAL_INCOME_OUTLAYS", referencePeriodStart: "2027-01-01",
      releaseStage: "INITIAL", stageLabel: null, unscheduled: null, flags: [],
      evidence: ev({ providerId: "bea-release-schedule-ics", sourceKind: "OFFICIAL_SCHEDULE",
        sourceUrl: "https://www.bea.gov/news/schedule/ics/online-calendar-subscription.ics",
        releaseDate: "2027-02-26", releaseAt: "2027-02-26T13:30:00.000Z", statedZone: "UTC", evidenceText: "DTSTART:20270226T133000Z" }) };
    const provider = createRecordCalendarProvider(mergeObservations([obs]));
    const res = await resolveHistoricalRelease(provider, {
      metricKey: "PCE_CORE", referencePeriodStart: "2027-01-01", releaseStage: "INITIAL" });
    expect(res?.timing).toMatchObject({ timingStatus: "SCHEDULED", releaseDate: "2027-02-26" });
    expect(res?.timing.provenance.sourceKind).toBe("OFFICIAL_SCHEDULE");
  });

  it("is independent of input order", () => {
    const a = [fomc(ev({})), sffed("2024-01-31", "2024-01-31T19:00:00.000Z"), sffed("2023-12-13", "2023-12-13T19:00:00.000Z")];
    expect(mergeObservations([...a].reverse())).toEqual(mergeObservations(a));
  });

  it("rejects evidence citing a secret-bearing or non-HTTPS URL, or an off-day instant", () => {
    expect(() => mergeObservations([fomc(ev({ sourceUrl: "https://api.stlouisfed.org/fred/release/dates?api_key=abc" }))])).toThrow(/credential-free/);
    expect(() => mergeObservations([fomc(ev({ sourceUrl: "http://www.federalreserve.gov/x.htm" }))])).toThrow();
    expect(() => mergeObservations([fomc(ev({ releaseAt: "2024-02-01T06:00:00.000Z" }))])).toThrow(/not on 2024-01-31/);
  });

  it("does not merge two releases whose reference period is unknown", () => {
    const blsObs = (day: string): CalendarObservation => ({ family: "BLS_CPI", referencePeriodStart: null,
      releaseStage: "INITIAL", stageLabel: null, unscheduled: null, flags: [],
      evidence: ev({ providerId: "bls-archive-operator-saved", releaseDate: day, releaseAt: null, statedZone: null,
        sourceUrl: `https://www.bls.gov/news.release/archives/cpi_${day.slice(5, 7)}${day.slice(8)}${day.slice(0, 4)}.htm`,
        evidenceText: "no embargo line" }) });
    const records = mergeObservations([blsObs("2024-01-11"), blsObs("2024-02-13")]);
    expect(records).toHaveLength(2);
    expect(records.every((r) => r.flags.includes("REFERENCE_PERIOD_UNKNOWN"))).toBe(true);
  });
});
