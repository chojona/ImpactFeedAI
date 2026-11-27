import { describe, expect, it } from "vitest";

import { resolveHistoricalRelease, type ReleaseIdentity } from "@/services/macro/release-calendar";
import { createRecordCalendarProvider, mergeObservations, recordIdentities } from "@/services/macro/release-calendar-records";

import {
  beaReleaseTitle,
  beaReleaseObservation,
  beaTextAttachments,
  classifyBeaTitle,
  parseBeaArchivePage,
  parseBeaEmbargo,
  parseBeaIcs,
} from "../scripts/ingest/release-calendar/source-bea";
import {
  blsReferencePeriod,
  parseBlsArchiveIndex,
  parseBlsDocument,
  parseBlsEmbargo,
  parseBlsFileName,
} from "../scripts/ingest/release-calendar/source-bls-local";
import { parseFredReleaseDates, reconcileWithFred } from "../scripts/ingest/release-calendar/source-fred";

const meta = { retrievedAt: "2026-11-27T12:00:00.000Z", contentSha256: "x" };

describe("BEA timing", () => {
  it("classifies national GDP/PIO releases with source-faithful stages", () => {
    expect(classifyBeaTitle("GDP (Advance Estimate), 3rd Quarter 2026")).toMatchObject({ family: "BEA_GDP", releaseStage: "ADVANCE", referencePeriodStart: "2026-07-01" });
    expect(classifyBeaTitle("GDP (Third Estimate), GDP by Industry, and Corporate Profits, 2nd Quarter 2025")).toMatchObject({ releaseStage: "THIRD_ESTIMATE" });
    expect(classifyBeaTitle("Gross Domestic Product, 3rd quarter 2003 (preliminary)")).toMatchObject({ releaseStage: "PRELIMINARY", stageLabel: "preliminary" });
    expect(classifyBeaTitle("Gross Domestic Product, 3rd Quarter 2025 (Initial Estimate) and Corporate Profits (Preliminary)"))
      .toMatchObject({ releaseStage: "INITIAL", stageLabel: "Initial Estimate", referencePeriodStart: "2025-07-01" });
    expect(classifyBeaTitle("Gross Domestic Product, 3rd Quarter 2025 (Updated Estimate), GDP by Industry, and Corporate Profits (Revised)"))
      .toMatchObject({ releaseStage: "REVISION", stageLabel: "Updated Estimate" });
    expect(classifyBeaTitle("Gross Domestic Product (Second Estimate), Corporate Profits (Preliminary Estimate), 1st Quarter 2025"))
      .toMatchObject({ releaseStage: "SECOND_ESTIMATE", referencePeriodStart: "2025-01-01" });
    expect(classifyBeaTitle("Gross Domestic Product and Corporate Profits, 1st quarter 2007 (preliminary)"))
      .toMatchObject({ releaseStage: "PRELIMINARY", referencePeriodStart: "2007-01-01" });
    expect(classifyBeaTitle('Corrected Gross Domestic Product, Second Quarter 2000 "advance" estimate and revised estimates'))
      .toMatchObject({ releaseStage: "REVISION", stageLabel: "Corrected advance" });
    expect(classifyBeaTitle("Personal Income, April 1999")).toMatchObject({ family: "BEA_PERSONAL_INCOME_OUTLAYS", referencePeriodStart: "1999-04-01" });
    expect(classifyBeaTitle("Personal Income, February 2019; Personal Outlays, January 2019")).toMatchObject({ referencePeriodStart: "2019-01-01" });
    expect(classifyBeaTitle("Personal Income by State, 2nd Quarter 2025")).toBeNull();
    expect(classifyBeaTitle("Personal Income and Outlays, September 2026")).toMatchObject({ family: "BEA_PERSONAL_INCOME_OUTLAYS", referencePeriodStart: "2026-09-01", releaseStage: "INITIAL" });
    expect(classifyBeaTitle("Gross Domestic Product by State and Personal Income by State, 2nd Quarter 2025")).toBeNull();
    expect(classifyBeaTitle("GDP for the U.S. Virgin Islands, 2024")).toBeNull();
    expect(classifyBeaTitle("U.S. International Trade in Goods and Services, November 2024")).toBeNull();
  });

  it("parses modern embargo lines and pre-2009 wire-transmission lines", () => {
    const modern = parseBeaEmbargo("Contacts EMBARGOED UNTIL RELEASE AT 8:30 a.m. EDT, Thursday, October 29, 2026 BEA 26—45 GDP");
    expect(modern).toMatchObject({ releaseDate: "2026-10-29", statedZone: "EDT", zoneLabelMismatch: false });
    expect(modern?.releaseAt?.toISOString()).toBe("2026-10-29T12:30:00.000Z");
    expect(modern?.text).toBe("EMBARGOED UNTIL RELEASE AT 8:30 a.m. EDT, Thursday, October 29, 2026");
    const wire = parseBeaEmbargo(" FOR WIRE TRANSMISSION: 8:30 A.M. EDT, THURSDAY, AUGUST 1, 1996 Christian Ehemann");
    expect(wire?.releaseAt?.toISOString()).toBe("1996-08-01T12:30:00.000Z");
    expect(parseBeaEmbargo("Next release: November 25, 2026, at 8:30 a.m. EST")).toBeNull();
  });

  it("extracts titles, attachments and archive links but not listing metadata", () => {
    const html = `<h1>News Release</h1><h1 class="t">Gross Domestic Product, 2nd quarter 1996 (advance) and Revised Estimates</h1>
      <a href="/sites/default/files/newsreleases/national/gdp/1996/gdp296a.txt">txt</a>
      <a href="/news/1996/gross-domestic-product-2nd-quarter-1996-advance-and-revised-estimates">x</a>
      <time datetime="1996-08-01T00:00:00-04:00">August 1, 1996</time>`;
    expect(beaReleaseTitle(html)).toMatch(/^Gross Domestic Product, 2nd quarter 1996/);
    expect(beaTextAttachments(html)).toEqual(["https://www.bea.gov/sites/default/files/newsreleases/national/gdp/1996/gdp296a.txt"]);
    expect(parseBeaArchivePage(html)).toEqual(["https://www.bea.gov/news/1996/gross-domestic-product-2nd-quarter-1996-advance-and-revised-estimates"]);
  });

  it("parses the ICS schedule: folded lines, escapes, UTC→New York day, cancellations", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT", "SUMMARY:Gross Domestic Product\\, 4th Quarter and Year 2024 (Advance Estima", " te)",
      "DTSTART;VALUE=DATE-TIME:20250130T133000Z", "UID:a", "END:VEVENT",
      "BEGIN:VEVENT", "SUMMARY:Personal Income and Outlays\\, February 2025", "DTSTART;VALUE=DATE-TIME:20250328T123000Z", "END:VEVENT",
      "BEGIN:VEVENT", "SUMMARY:Personal Income and Outlays\\, September 2025", "STATUS:CANCELLED", "DTSTART;VALUE=DATE-TIME:20251031T123000Z", "END:VEVENT",
      "BEGIN:VEVENT", "SUMMARY:U.S. International Trade in Goods and Services\\, November 2024", "DTSTART;VALUE=DATE-TIME:20250107T133000Z", "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const res = parseBeaIcs(ics, meta);
    expect(res.observations.filter((o) => o.evidence.scheduleStatus !== "CANCELLED").map((o) => [o.family, o.releaseStage, o.referencePeriodStart, o.evidence.releaseDate, o.evidence.releaseAt])).toEqual([
      ["BEA_GDP", "ADVANCE", "2024-10-01", "2025-01-30", "2025-01-30T13:30:00.000Z"],
      ["BEA_PERSONAL_INCOME_OUTLAYS", "INITIAL", "2025-02-01", "2025-03-28", "2025-03-28T12:30:00.000Z"],
    ]);
    expect(res.observations[0].evidence.sourceKind).toBe("OFFICIAL_SCHEDULE");
    expect(res.observations[2].evidence).toMatchObject({ scheduleStatus: "CANCELLED", releaseAt: null });
    expect(res.skipped).toEqual([{ summary: "Personal Income and Outlays, September 2025", reason: "cancelled" }]);
  });

  it("keeps the Q3 2025 initial GDP publication and retires its superseded schedules", async () => {
    // https://www.bea.gov/news/blog/2025-12-10/economic-release-schedule-updates
    const sourceUrl = "https://www.bea.gov/news/2025/gross-domestic-product-3rd-quarter-2025-initial-estimate-and-corporate-profits";
    const identity = classifyBeaTitle("Gross Domestic Product, 3rd Quarter 2025 (Initial Estimate) and Corporate Profits (Preliminary)");
    const body = "EMBARGOED UNTIL RELEASE AT 8:30 a.m. EST, Tuesday, December 23, 2025. " +
      "This initial report replaces the release of the advance estimate originally scheduled for October 30 and the second estimate originally scheduled for November 26.";
    const embargo = parseBeaEmbargo(body);
    if (!identity || !embargo) throw new Error("invalid BEA fixture");
    const publication = beaReleaseObservation(identity, embargo, { ...meta, sourceUrl }, body);
    const schedules = parseBeaIcs([
      "BEGIN:VEVENT", "SUMMARY:GDP (Advance Estimate), 3rd Quarter 2025", "DTSTART:20251030T123000Z", "END:VEVENT",
      "BEGIN:VEVENT", "SUMMARY:GDP (Second Estimate), 3rd Quarter 2025", "DTSTART:20251126T133000Z", "END:VEVENT",
      "BEGIN:VEVENT", "SUMMARY:GDP (Advance Estimate), 4th Quarter 2025", "DTSTART:20260129T133000Z", "END:VEVENT",
    ].join("\n"), meta).observations;
    const records = mergeObservations([...schedules, publication]);
    expect(records.map((r) => [r.referencePeriodStart, r.releaseStage])).toEqual([
      ["2025-07-01", "INITIAL"], ["2025-10-01", "ADVANCE"],
    ]);
    expect(records[0]).toMatchObject({ scheduleChanges: [
      { releaseStage: "ADVANCE", disposition: "SUPERSEDED", sourceUrl },
      { releaseStage: "SECOND_ESTIMATE", disposition: "SUPERSEDED", sourceUrl },
    ] });
    const provider = createRecordCalendarProvider(records);
    const key = { metricKey: "GDP_REAL", referencePeriodStart: "2025-07-01" };
    expect(await provider.resolve({ ...key, releaseStage: "ADVANCE" })).toBeNull();
    expect(await provider.resolve({ ...key, releaseStage: "SECOND_ESTIMATE" })).toBeNull();
    expect(await provider.resolve({ ...key, releaseStage: "INITIAL" })).toMatchObject({ releaseDate: "2025-12-23" });
    expect(mergeObservations([publication, ...schedules].reverse())).toEqual(records);
  });

  it("withholds a retained schedule when the same event has an official cancellation", () => {
    const events = [
      "BEGIN:VEVENT", "SUMMARY:GDP (Advance Estimate), 3rd Quarter 2025", "DTSTART:20251030T123000Z", "UID:gdp-3q25-advance", "END:VEVENT",
      "BEGIN:VEVENT", "SUMMARY:GDP (Advance Estimate), 3rd Quarter 2025", "DTSTART:20251030T123000Z", "UID:gdp-3q25-advance", "STATUS:CANCELLED", "END:VEVENT",
    ].join("\n");
    expect(mergeObservations(parseBeaIcs(events, meta).observations)).toEqual([]);
  });

  it("resolves both PCE metrics for both periods in the bundled October and November 2025 release", async () => {
    const sourceUrl = "https://www.bea.gov/news/2026/personal-income-and-outlays-october-and-november-2025";
    const identity = classifyBeaTitle("Personal Income and Outlays, October and November 2025");
    const embargo = parseBeaEmbargo("EMBARGOED UNTIL RELEASE AT 10:00 a.m. EST, Thursday, January 22, 2026");
    if (!identity || !embargo) throw new Error("invalid BEA fixture");
    const publication = beaReleaseObservation(identity, embargo, { ...meta, sourceUrl });
    const schedules = parseBeaIcs([
      "BEGIN:VEVENT", "SUMMARY:Personal Income and Outlays, October 2025", "DTSTART:20251126T133000Z", "END:VEVENT",
      "BEGIN:VEVENT", "SUMMARY:Personal Income and Outlays, November 2025", "DTSTART:20251219T133000Z", "END:VEVENT",
    ].join("\n"), meta).observations;
    const records = mergeObservations([...schedules, publication]);
    expect(records).toHaveLength(1);
    expect(recordIdentities(records[0])).toHaveLength(4);
    const provider = createRecordCalendarProvider(records);
    for (const metricKey of ["PCE_HEADLINE", "PCE_CORE"]) {
      for (const referencePeriodStart of ["2025-10-01", "2025-11-01"]) {
        expect(await provider.resolve({ metricKey, referencePeriodStart, releaseStage: "INITIAL" }))
          .toMatchObject({ releaseDate: "2026-01-22", timingStatus: "DATE_ONLY" });
      }
    }
  });
});

describe("BLS operator-saved archive documents", () => {
  it("maps archive file names to families, days and canonical citations", () => {
    expect(parseBlsFileName("cpi_01112024.htm")).toMatchObject({ family: "BLS_CPI", releaseDate: "2024-01-11", url: "https://www.bls.gov/news.release/archives/cpi_01112024.htm" });
    expect(parseBlsFileName("cpi_07151999.txt")?.url).toBe("https://www.bls.gov/news.release/history/cpi_07151999.txt");
    expect(parseBlsFileName("empsit_11202025.html")).toMatchObject({ family: "BLS_EMPLOYMENT_SITUATION", releaseDate: "2025-11-20" });
    expect(parseBlsFileName("cpi_02302024.htm")).toBeNull();
    expect(parseBlsFileName("notes.htm")).toBeNull();
  });

  it("parses embargo variants seen in the archive", () => {
    expect(parseBlsEmbargo("Transmission of material in this release is embargoed until 8:30 a.m. (ET) Thursday, January 11, 2024 CPI")
      ?.releaseAt?.toISOString()).toBe("2024-01-11T13:30:00.000Z");
    expect(parseBlsEmbargo("is embargoed until USDL-24-0148 8:30 a.m. (ET) Friday, February 2, 2024")?.releaseDate).toBe("2024-02-02");
    const twoColumn = parseBlsEmbargo("INFORMATION: (202) 606-7828 RELEASE IS EMBARGOED MEDIA CONTACT: (202) 606-5902 UNTIL 8:30 A.M. (EDT) TDD: (202) 606-5897 Thursday, July 15, 1999");
    expect(twoColumn).toMatchObject({ releaseDate: "1999-07-15", statedZone: "EDT" });
    expect(twoColumn?.releaseAt?.toISOString()).toBe("1999-07-15T12:30:00.000Z");
  });

  it("does not take the time from a 'next release' sentence", () => {
    expect(parseBlsEmbargo("RELEASE IS EMBARGOED. The next release is scheduled for August 17, 1999, at 8:30 A.M. (EDT).")).toBeNull();
  });

  it("reads the reference period from the title only", () => {
    expect(blsReferencePeriod("BLS_CPI", "Consumer Price Index News Release - 2024 M01 Results")).toBe("2024-01-01");
    expect(blsReferencePeriod("BLS_EMPLOYMENT_SITUATION", "THE EMPLOYMENT SITUATION — SEPTEMBER 2025")).toBe("2025-09-01");
    expect(blsReferencePeriod("BLS_PPI", "Producer price indexes rose")).toBeNull();
  });

  it("handles a shutdown-delayed release without inferring the period from the release month", () => {
    const html = `<title>Employment Situation News Release - 2025 M09 Results</title>
      <pre>Transmission of material in this release is embargoed until 8:30 a.m. (ET) Thursday, November 20, 2025</pre>`;
    const res = parseBlsDocument({ fileName: "empsit_11202025.htm", content: html, savedAt: meta.retrievedAt, contentSha256: "h" });
    if (res.kind !== "observation") throw new Error(res.reason);
    expect(res.observation).toMatchObject({ referencePeriodStart: "2025-09-01", flags: [] });
    expect(res.observation.evidence).toMatchObject({ releaseDate: "2025-11-20", releaseAt: "2025-11-20T13:30:00.000Z",
      sourceUrl: "https://www.bls.gov/news.release/archives/empsit_11202025.htm", sourceKind: "OFFICIAL_RELEASE_RECORD" });
    const [rec] = mergeObservations([res.observation]);
    expect(rec).toMatchObject({ timingStatus: "DATE_ONLY", releaseAt: null, metricKeys: ["PAYROLLS", "UNEMPLOYMENT_RATE"],
      timingFacts: { intendedEmbargo: { at: "2025-11-20T13:30:00.000Z" }, documentedPublication: null, earliestEvidencedAvailability: null } });
  });

  it("keeps the May 2024 CPI embargo, formal publication and earlier file availability separate", async () => {
    const res = parseBlsDocument({ fileName: "cpi_05152024.htm", savedAt: meta.retrievedAt, contentSha256: "h",
      content: `<title>Consumer Price Index News Release - 2024 M04 Results</title>
        <pre>Transmission of material in this release is embargoed until 8:30 a.m. (ET) Wednesday, May 15, 2024</pre>` });
    if (res.kind !== "observation") throw new Error(res.reason);
    const incidentUrl = "https://www.bls.gov/bls/teamofexperts60dayreport202411.pdf";
    const records = mergeObservations([res.observation]);
    expect(records[0]).toMatchObject({ releaseAtKind: "DOCUMENTED_PUBLICATION", timingFacts: {
      intendedEmbargo: { at: "2024-05-15T12:30:00.000Z", sourceUrl: "https://www.bls.gov/news.release/archives/cpi_05152024.htm" },
      documentedPublication: { at: "2024-05-15T12:30:00.000Z", sourceUrl: incidentUrl },
      earliestEvidencedAvailability: { at: "2024-05-15T11:58:00.000Z", precision: "APPROXIMATE_MINUTE", scope: "RELATED_FILES", sourceUrl: incidentUrl },
    } });
    const resolved = await resolveHistoricalRelease(createRecordCalendarProvider(records), {
      metricKey: "CPI_HEADLINE", referencePeriodStart: "2024-04-01", releaseStage: "INITIAL",
    });
    expect(resolved?.timing).toMatchObject({ timingStatus: "VERIFIED", releaseAtKind: "DOCUMENTED_PUBLICATION",
      releaseAt: new Date("2024-05-15T12:30:00.000Z"), timingFacts: {
        intendedEmbargo: { at: new Date("2024-05-15T12:30:00.000Z") },
        documentedPublication: { at: new Date("2024-05-15T12:30:00.000Z") },
        earliestEvidencedAvailability: { at: new Date("2024-05-15T11:58:00.000Z"), scope: "RELATED_FILES" },
      },
    });
  });

  it("indexes both bundled payroll first prints and only the evidenced unemployment month", async () => {
    // https://www.bls.gov/news.release/archives/empsit_12162025.htm
    const res = parseBlsDocument({ fileName: "empsit_12162025.htm", savedAt: meta.retrievedAt, contentSha256: "h",
      content: `<title>Employment Situation News Release - 2025 M11 Results</title>
        <pre>Transmission of material in this release is embargoed until 8:30 a.m. (ET) Tuesday, December 16, 2025
        Household survey data for October 2025 were not collected.
        This news release includes the initial establishment survey estimates for both October and
        November; therefore, there are no revisions to report for October estimates.</pre>` });
    if (res.kind !== "observation") throw new Error(res.reason);
    const records = mergeObservations([res.observation]);
    expect(records).toHaveLength(1);
    const id = (metricKey: string, referencePeriodStart: string): ReleaseIdentity => ({ metricKey, referencePeriodStart, releaseStage: "INITIAL" });
    const expected = [id("PAYROLLS", "2025-10-01"), id("PAYROLLS", "2025-11-01"), id("UNEMPLOYMENT_RATE", "2025-11-01")];
    expect(recordIdentities(records[0])).toEqual(expected);
    const provider = createRecordCalendarProvider(records);
    for (const identity of expected) {
      expect(await provider.resolve(identity)).toMatchObject({ releaseDate: "2025-12-16" });
    }
    expect(await provider.resolve(id("UNEMPLOYMENT_RATE", "2025-10-01"))).toBeNull();
    expect(await provider.resolve(id("PAYROLLS", "2025-09-01"))).toBeNull();
  });

  it("indexes the October 2025 headline PPI carried in the November 2025 release", async () => {
    // https://www.bls.gov/news.release/archives/ppi_01142026.htm
    const res = parseBlsDocument({ fileName: "ppi_01142026.htm", savedAt: meta.retrievedAt, contentSha256: "h",
      content: `<title>Producer Price Index News Release - 2025 M11 Results</title>
        <pre>Embargoed until 8:30 a.m. (ET) Wednesday, January 14, 2026
        The Producer Price Index for final demand increased 0.2 percent in November.
        Final demand prices edged up 0.1 percent in October and advanced 0.6 percent in September.</pre>` });
    if (res.kind !== "observation") throw new Error(res.reason);
    const provider = createRecordCalendarProvider(mergeObservations([res.observation]));
    const key = { metricKey: "PPI_HEADLINE", releaseStage: "INITIAL" as const };
    expect(await provider.resolve({ ...key, referencePeriodStart: "2025-10-01" })).toMatchObject({ releaseDate: "2026-01-14" });
    expect(await provider.resolve({ ...key, referencePeriodStart: "2025-09-01" })).toBeNull();
  });

  it("flags a file-name/embargo date conflict and skips error pages and PDFs", () => {
    const conflict = parseBlsDocument({ fileName: "cpi_01102024.htm", savedAt: meta.retrievedAt, contentSha256: "h",
      content: "embargoed until 8:30 a.m. (ET) Thursday, January 11, 2024" });
    expect(conflict.kind === "observation" && conflict.observation.flags).toEqual(["DATE_CONFLICT"]);
    const denied = parseBlsDocument({ fileName: "cpi_01112024.htm", savedAt: meta.retrievedAt, contentSha256: "h",
      content: "<title>Access Denied</title> Bureau of Labor Statistics Access Denied" });
    expect(denied).toMatchObject({ kind: "skipped" });
    expect(parseBlsDocument({ fileName: "cpi_01112024.pdf", savedAt: meta.retrievedAt, contentSha256: "h", content: "%PDF" })).toMatchObject({ kind: "skipped" });
  });

  it("keeps a document without an embargo line as date-only", () => {
    const res = parseBlsDocument({ fileName: "ppi_12122023.htm", savedAt: meta.retrievedAt, contentSha256: "h",
      content: "<title>Producer Price Index News Release - 2023 M11 Results</title> no embargo statement" });
    if (res.kind !== "observation") throw new Error("expected observation");
    expect(res.observation.evidence.releaseAt).toBeNull();
    expect(mergeObservations([res.observation])[0].timingStatus).toBe("DATE_ONLY");
  });

  it("retains an unresolved DST embargo line and its independently evidenced date", () => {
    const line = "Embargoed until 1:30 a.m. (ET) Sunday, November 3, 2024";
    const res = parseBlsDocument({ fileName: "cpi_11032024.htm", savedAt: meta.retrievedAt, contentSha256: "h",
      content: `<title>Consumer Price Index News Release - 2024 M10 Results</title><pre>${line}</pre>` });
    if (res.kind !== "observation") throw new Error(res.reason);
    expect(res.observation.evidence).toMatchObject({ releaseDate: "2024-11-03", releaseAt: null,
      evidenceText: expect.stringContaining(line), clockKind: "INTENDED_EMBARGO" });
    expect(mergeObservations([res.observation])[0]).toMatchObject({ releaseAt: null,
      timingStatus: "DATE_ONLY", timingFacts: { intendedEmbargo: null } });
    expect(parseBeaEmbargo("EMBARGOED UNTIL RELEASE AT 2:30 a.m. EDT, Sunday, March 10, 2024"))
      .toMatchObject({ releaseDate: "2024-03-10", releaseAt: null });
  });

  it("parses archive index pages for a completeness check", () => {
    const html = `<a href="/news.release/archives/cpi_01112024.htm">HTML</a> <a href="/news.release/archives/cpi_01112024.pdf">PDF</a>
      <a href="/news.release/history/cpi_07151999.txt">TXT</a>`;
    expect(parseBlsArchiveIndex(html).map((n) => [n.releaseDate, n.extension])).toEqual([["1999-07-15", "txt"], ["2024-01-11", "htm"]]);
  });
});

describe("FRED release-date reconciliation", () => {
  it("parses release/dates and reports matched, official-only and FRED-only days in the official window", () => {
    const dates = parseFredReleaseDates(JSON.stringify({ release_dates: [
      { release_id: 50, date: "2025-09-05" }, { date: "2025-11-20" }, { date: "2025-12-16" }, { date: "2026-01-09" }, { date: "1995-01-06" } ] }));
    const obs = (day: string, period: string) => ({ family: "BLS_EMPLOYMENT_SITUATION" as const, referencePeriodStart: period,
      releaseStage: "INITIAL" as const, stageLabel: null, unscheduled: null, flags: [],
      evidence: { providerId: "bls-archive-operator-saved", sourceName: "BLS", sourceKind: "OFFICIAL_RELEASE_RECORD" as const,
        sourceUrl: `https://www.bls.gov/news.release/archives/empsit_${day.slice(5, 7)}${day.slice(8)}${day.slice(0, 4)}.htm`,
        retrievedAt: meta.retrievedAt, releaseDate: day, releaseAt: null, statedZone: null, evidenceText: "file", contentSha256: null } });
    const records = mergeObservations([obs("2025-09-05", "2025-08-01"), obs("2025-11-20", "2025-09-01"), obs("2026-01-09", "2025-12-01"), obs("2025-10-03", "2025-07-01")]);
    const r = reconcileWithFred("BLS_EMPLOYMENT_SITUATION", records, dates);
    expect(r).toMatchObject({ fredReleaseId: 50, window: { from: "2025-09-05", to: "2026-01-09" }, matched: 3,
      officialOnly: ["2025-10-03"], fredOnly: ["2025-12-16"] });
  });

  it("does not judge future scheduled days that FRED cannot list yet", () => {
    const sched = (day: string, period: string) => ({ family: "BEA_GDP" as const, referencePeriodStart: period, releaseStage: "ADVANCE" as const,
      stageLabel: "Advance", unscheduled: null, flags: [], evidence: { providerId: "bea-release-schedule-ics", sourceName: "BEA ICS",
        sourceKind: "OFFICIAL_SCHEDULE" as const, sourceUrl: "https://www.bea.gov/news/schedule/ics/online-calendar-subscription.ics",
        retrievedAt: meta.retrievedAt, releaseDate: day, releaseAt: null, statedZone: null, evidenceText: "DTSTART", contentSha256: null } });
    const r = reconcileWithFred("BEA_GDP", mergeObservations([sched("2026-10-29", "2026-07-01"), sched("2027-01-28", "2026-10-01")]), ["2026-10-29"]);
    expect(r).toMatchObject({ window: { from: "2026-10-29", to: "2026-10-29" }, matched: 1, officialOnly: [], officialCount: 1 });
  });

  it("surfaces FRED API errors instead of returning an empty calendar", () => {
    expect(() => parseFredReleaseDates(JSON.stringify({ error_code: 400, error_message: "Bad Request." }))).toThrow(/Bad Request/);
  });
});
