import { describe, expect, it } from "vitest";

import { mergeObservations } from "@/services/macro/release-calendar-records";

import {
  beaReleaseTitle,
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
    expect(modern?.releaseAt.toISOString()).toBe("2026-10-29T12:30:00.000Z");
    expect(modern?.text).toBe("EMBARGOED UNTIL RELEASE AT 8:30 a.m. EDT, Thursday, October 29, 2026");
    const wire = parseBeaEmbargo(" FOR WIRE TRANSMISSION: 8:30 A.M. EDT, THURSDAY, AUGUST 1, 1996 Christian Ehemann");
    expect(wire?.releaseAt.toISOString()).toBe("1996-08-01T12:30:00.000Z");
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
    expect(res.observations.map((o) => [o.family, o.releaseStage, o.referencePeriodStart, o.evidence.releaseDate, o.evidence.releaseAt])).toEqual([
      ["BEA_GDP", "ADVANCE", "2024-10-01", "2025-01-30", "2025-01-30T13:30:00.000Z"],
      ["BEA_PERSONAL_INCOME_OUTLAYS", "INITIAL", "2025-02-01", "2025-03-28", "2025-03-28T12:30:00.000Z"],
    ]);
    expect(res.observations[0].evidence.sourceKind).toBe("OFFICIAL_SCHEDULE");
    expect(res.skipped).toEqual([{ summary: "Personal Income and Outlays, September 2025", reason: "cancelled" }]);
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
      ?.releaseAt.toISOString()).toBe("2024-01-11T13:30:00.000Z");
    expect(parseBlsEmbargo("is embargoed until USDL-24-0148 8:30 a.m. (ET) Friday, February 2, 2024")?.releaseDate).toBe("2024-02-02");
    const twoColumn = parseBlsEmbargo("INFORMATION: (202) 606-7828 RELEASE IS EMBARGOED MEDIA CONTACT: (202) 606-5902 UNTIL 8:30 A.M. (EDT) TDD: (202) 606-5897 Thursday, July 15, 1999");
    expect(twoColumn).toMatchObject({ releaseDate: "1999-07-15", statedZone: "EDT" });
    expect(twoColumn?.releaseAt.toISOString()).toBe("1999-07-15T12:30:00.000Z");
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
    expect(rec).toMatchObject({ timingStatus: "VERIFIED", metricKeys: ["PAYROLLS", "UNEMPLOYMENT_RATE"] });
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
