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
  evidenceText: "The statement was made public at 2:00 p.m. EST",
  contentSha256: null,
  ...((over.sourceKind === undefined || over.sourceKind === "OFFICIAL_RELEASE_RECORD") && over.releaseAt !== null
    ? { clockKind: "DOCUMENTED_PUBLICATION" as const } : {}),
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

  it("keeps publication evidence distinct when the intended clock disagrees", async () => {
    const intended = fomc(ev({ clockKind: "INTENDED_EMBARGO", evidenceText: "For release at 2:00 p.m. EST" }));
    const documented = fomc(ev({
      releaseAt: "2024-01-31T19:04:00.000Z",
      evidenceText: "The statement was made public at 2:04 p.m. EST",
      sourceUrl: "https://www.federalreserve.gov/newsevents/pressreleases/statement-timing.htm",
    }));
    const records = mergeObservations([intended, documented]);
    expect(records[0].flags).not.toContain("TIME_CONFLICT");
    const result = await resolveHistoricalRelease(createRecordCalendarProvider(records), FOMC_ID("2024-01-31"));
    expect(result?.timing).toMatchObject({
      releaseAt: new Date("2024-01-31T19:04:00.000Z"),
      releaseAtKind: "DOCUMENTED_PUBLICATION",
      timingFacts: {
        intendedEmbargo: { at: new Date("2024-01-31T19:00:00.000Z") },
        earliestEvidencedAvailability: null,
      },
      provenance: { sourceUrl: documented.evidence.sourceUrl },
    });
  });

  it("leaves an unclassified archive clock unresolved during a replay", async () => {
    const legacy = fomc(ev({ clockKind: undefined, evidenceText: "For release at 2:00 p.m. EST" }));
    const result = await resolveHistoricalRelease(createRecordCalendarProvider(mergeObservations([legacy])), FOMC_ID("2024-01-31"));
    expect(result?.timing).toMatchObject({ timingStatus: "DATE_ONLY", releaseAt: null, timingFacts: {
      intendedEmbargo: null, documentedPublication: null, earliestEvidencedAvailability: null,
    } });
  });

  it("never projects research-only timing onto the contract", async () => {
    const records = mergeObservations([sffed("1990-07-13", "1990-07-13T15:30:00.000Z")]);
    expect(records[0].timingStatus).toBe("SECONDARY_ONLY");
    const res = await resolveHistoricalRelease(createRecordCalendarProvider(records), {
      metricKey: "FED_TARGET_UPPER", referencePeriodStart: "1990-07-13", releaseStage: "INITIAL" });
    expect(res).toBeNull();
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

const FOMC_ID = (day: string) => ({ metricKey: "FED_TARGET_UPPER", referencePeriodStart: day, releaseStage: "INITIAL" as const });
const GDP_ID = { metricKey: "GDP_REAL", referencePeriodStart: "2025-07-01", releaseStage: "ADVANCE" as const };
const gdpBase = { family: "BEA_GDP" as const, referencePeriodStart: "2025-07-01", releaseStage: "ADVANCE" as const,
  stageLabel: "Advance", unscheduled: null, flags: [] };
const ICS_URL = "https://www.bea.gov/news/schedule/ics/online-calendar-subscription.ics";
const beaSchedule = (releaseDate: string, releaseAt: string): CalendarObservation => ({ ...gdpBase,
  evidence: ev({ providerId: "bea-release-schedule-ics", sourceKind: "OFFICIAL_SCHEDULE", sourceUrl: ICS_URL,
    releaseDate, releaseAt, statedZone: "UTC", evidenceText: `DTSTART:${releaseAt}` }) });
const beaRecord = (releaseDate: string, releaseAt: string | null, slug = "gdp-advance-estimate-3rd-quarter-2025"): CalendarObservation => ({ ...gdpBase,
  evidence: ev({ providerId: "bea-news-release", sourceUrl: `https://www.bea.gov/news/2025/${slug}`,
    releaseDate, releaseAt, statedZone: releaseAt ? "EST" : null, evidenceText: `The release was published on ${releaseDate}${releaseAt ? ` at ${releaseAt}` : ""}` }) });

describe("release-calendar conflict policy", () => {
  it("lets the publication determine a rescheduled BEA release; the schedule mismatch is informational", async () => {
    // A same-stage reschedule, separate from the actual Q3 2025 replacement fixture.
    const records = mergeObservations([beaSchedule("2025-10-30", "2025-10-30T12:30:00.000Z"),
      beaRecord("2025-12-23", "2025-12-23T13:30:00.000Z")]);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ timingStatus: "VERIFIED", releaseDate: "2025-12-23", releaseAt: "2025-12-23T13:30:00.000Z" });
    expect(records[0].flags).toEqual(["SCHEDULE_DIFFERS_FROM_RECORD"]);
    const res = await resolveHistoricalRelease(createRecordCalendarProvider(records), GDP_ID);
    expect(res?.timing).toMatchObject({ timingStatus: "VERIFIED", releaseDate: "2025-12-23" });
    expect(res?.timing.provenance).toMatchObject({ sourceKind: "OFFICIAL_RELEASE_RECORD",
      sourceUrl: "https://www.bea.gov/news/2025/gdp-advance-estimate-3rd-quarter-2025" });
  });

  it("uses the published clock time when a release moved within the scheduled day", async () => {
    const records = mergeObservations([beaSchedule("2025-12-23", "2025-12-23T15:00:00.000Z"),
      beaRecord("2025-12-23", "2025-12-23T13:30:00.000Z")]);
    expect(records[0]).toMatchObject({ timingStatus: "VERIFIED", releaseAt: "2025-12-23T13:30:00.000Z", flags: ["SCHEDULE_DIFFERS_FROM_RECORD"] });
    expect((await resolveHistoricalRelease(createRecordCalendarProvider(records), GDP_ID))?.timing.releaseAt?.toISOString())
      .toBe("2025-12-23T13:30:00.000Z");
  });

  it("prefers a published date over a scheduled clock time", async () => {
    const records = mergeObservations([beaSchedule("2025-10-30", "2025-10-30T12:30:00.000Z"), beaRecord("2025-12-23", null)]);
    expect(records[0]).toMatchObject({ timingStatus: "DATE_ONLY", releaseDate: "2025-12-23", releaseAt: null, flags: ["SCHEDULE_DIFFERS_FROM_RECORD"] });
    expect((await resolveHistoricalRelease(createRecordCalendarProvider(records), GDP_ID))?.timing)
      .toMatchObject({ timingStatus: "DATE_ONLY", releaseDate: "2025-12-23", releaseAt: null });
  });

  it("refuses official publications that state different days", async () => {
    const records = mergeObservations([beaRecord("2025-12-23", "2025-12-23T13:30:00.000Z"),
      beaRecord("2025-12-24", "2025-12-24T13:30:00.000Z", "gdp-advance-estimate-3rd-quarter-2025-reissue")]);
    expect(records[0].flags).toContain("DATE_CONFLICT");
    expect(await resolveHistoricalRelease(createRecordCalendarProvider(records), GDP_ID)).toBeNull();
  });

  it("refuses official publications that state different times on the same day", async () => {
    const records = mergeObservations([beaRecord("2025-12-23", "2025-12-23T13:30:00.000Z"),
      beaRecord("2025-12-23", "2025-12-23T15:00:00.000Z", "gdp-advance-estimate-3rd-quarter-2025-reissue")]);
    expect(records[0].flags).toEqual(["TIME_CONFLICT"]);
    expect(await resolveHistoricalRelease(createRecordCalendarProvider(records), GDP_ID)).toBeNull();
  });

  it("refuses a single document whose file-name day and embargo day disagree", async () => {
    const obs = { ...beaRecord("2025-12-23", "2025-12-23T13:30:00.000Z"), flags: ["DATE_CONFLICT" as const] };
    expect(await resolveHistoricalRelease(createRecordCalendarProvider(mergeObservations([obs])), GDP_ID)).toBeNull();
  });

  it("never promotes an SF Fed time to VERIFIED, alone or beside a date-only statement", async () => {
    const alone = mergeObservations([sffed("2005-06-30", "2005-06-30T18:15:00.000Z")]);
    expect(alone[0]).toMatchObject({ timingStatus: "SECONDARY_ONLY", releaseAt: "2005-06-30T18:15:00.000Z" });
    expect(await resolveHistoricalRelease(createRecordCalendarProvider(alone), FOMC_ID("2005-06-30"))).toBeNull();

    const statement = fomc(ev({ releaseDate: "2005-06-30", releaseAt: null, statedZone: null,
      sourceUrl: "https://www.federalreserve.gov/boarddocs/press/monetary/2005/20050630/default.htm",
      evidenceText: "page date: 2005-06-30 | For immediate release" }));
    const paired = mergeObservations([statement, sffed("2005-06-30", "2005-06-30T18:15:00.000Z")]);
    expect(paired[0]).toMatchObject({ timingStatus: "DATE_ONLY", releaseAt: null, timePrecision: "DATE" });
    expect(paired[0].flags).toContain("SECONDARY_TIME_ONLY");
    const res = await resolveHistoricalRelease(createRecordCalendarProvider(paired), FOMC_ID("2005-06-30"));
    expect(res?.timing).toMatchObject({ timingStatus: "DATE_ONLY", releaseAt: null });
    expect(res?.timing.provenance.sourceKind).toBe("OFFICIAL_RELEASE_RECORD");
  });

  it("keeps the official instant when research disagrees, flagging it without withholding", async () => {
    const records = mergeObservations([fomc(ev({})), sffed("2024-01-31", "2024-01-31T19:15:00.000Z")]);
    expect(records[0]).toMatchObject({ timingStatus: "VERIFIED", releaseAt: "2024-01-31T19:00:00.000Z",
      flags: ["SECONDARY_DIFFERS_FROM_OFFICIAL"] });
    const res = await resolveHistoricalRelease(createRecordCalendarProvider(records), FOMC_ID("2024-01-31"));
    expect(res?.timing).toMatchObject({ timingStatus: "VERIFIED" });
    expect(res?.timing.provenance.sourceUrl).toContain("federalreserve.gov");
  });
});
