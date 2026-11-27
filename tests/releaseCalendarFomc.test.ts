import { deflateRawSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  classifyHeading,
  parseCalendarPage,
  parseHistoricalYearPage,
  parseStatementPage,
  type StatementLink,
} from "../scripts/ingest/release-calendar/source-fomc-fed";
import { parseSfFedWorkbook } from "../scripts/ingest/release-calendar/source-fomc-sffed";
import { excelSerialToIsoDay } from "../scripts/ingest/release-calendar/xlsx";

const meta = { retrievedAt: "2026-11-27T12:00:00.000Z", contentSha256: "x" };

// Markup shapes copied from federalreserve.gov fomchistorical2008.htm / 2015.htm.
const YEAR_PAGE = `
<div class="panel-heading"> <h5>January 21 Conference Call - 2008</h5> </div>
<div class="panel-body"><p><a href="/newsevents/press/monetary/20080122b.htm">Statement</a></p></div>
<div class="panel-heading"> <h5>January 29-30 Meeting - 2008</h5> </div>
<div class="panel-body"><p><a href="/newsevents/press/monetary/20080130a.htm">Statement</a></p>
<p><a href="/monetarypolicy/files/FOMC_LongerRunGoals_201201.pdf">Statement on Longer-Run Goals and Monetary Policy Strategy (PDF)</a></p></div>
<h5 class="panel-heading">March 25 Meeting - 1997</h5><p><a href="/boarddocs/press/general/1997/19970325/">Statement</a></p>
<h5 class="panel-heading">March 15 (unscheduled) Meeting - 2020</h5><p><a href="/newsevents/pressreleases/monetary20200315a.htm">Statement</a></p>`;

// Shape copied from fomccalendars.htm.
const CALENDAR = `
<div class="row fomc-meeting" "> <div class="fomc-meeting__month col-xs-5"><strong>January</strong></div>
<div class="fomc-meeting__date col-xs-4">27-28</div> <div class="col-xs-12"> <strong>Statement:</strong><br>
<a href="/monetarypolicy/files/monetary20260128a1.pdf">PDF</a> | <a href="/newsevents/pressreleases/monetary20260128a.htm">HTML</a><br>
<a href="/newsevents/pressreleases/monetary20260128a1.htm">Implementation Note</a> </div></div>
<div class="fomc-meeting--shaded row fomc-meeting" "> <div class="fomc-meeting__month"><strong>December</strong></div>
<div class="fomc-meeting__date">8-9*</div> <div class="col-xs-12"> </div></div>`;

const page = (time: string, releaseTime: string) =>
  `<html><p class="article__time">${time}</p><p class="releaseTime">${releaseTime}   </p></html>`;
const link = (url: string, urlDate: string, unscheduled: boolean | null = false): StatementLink =>
  ({ url, urlDate, heading: null, unscheduled });

describe("Federal Reserve FOMC statement archive", () => {
  it("finds only policy statements, with dates from URLs and unscheduled headings", () => {
    const links = parseHistoricalYearPage(YEAR_PAGE);
    expect(links.map((l) => [l.urlDate, l.unscheduled])).toEqual([
      ["2008-01-22", true],
      ["2008-01-30", false],
      ["1997-03-25", false],
      ["2020-03-15", true],
    ]);
    expect(links[0].url).toBe("https://www.federalreserve.gov/newsevents/press/monetary/20080122b.htm");
    expect(classifyHeading("July 1 (notation vote) - 2010")).toBe(true);
  });

  it("reads recent statements from the calendar and ignores future meetings", () => {
    expect(parseCalendarPage(CALENDAR)).toEqual([{
      url: "https://www.federalreserve.gov/newsevents/pressreleases/monetary20260128a.htm",
      urlDate: "2026-01-28", heading: "27-28", unscheduled: false }]);
  });

  it("verifies an explicit release time, DST-aware", () => {
    const winter = parseStatementPage(page("December 14, 2016", "For release at 2:00 p.m. EST"),
      link("https://www.federalreserve.gov/newsevents/pressreleases/monetary20161214a.htm", "2016-12-14"), meta);
    expect(winter.observation.evidence).toMatchObject({ releaseAt: "2016-12-14T19:00:00.000Z", statedZone: "EST", sourceKind: "OFFICIAL_RELEASE_RECORD" });
    const sunday = parseStatementPage(page("March 15, 2020", "For release at 5:00 p.m. EDT"),
      link("https://www.federalreserve.gov/newsevents/pressreleases/monetary20200315a.htm", "2020-03-15", true), meta);
    expect(sunday.observation.evidence.releaseAt).toBe("2020-03-15T21:00:00.000Z");
    expect(sunday.observation.unscheduled).toBe(true);
  });

  it("keeps 'For immediate release' as date-only and never assumes 2:15 p.m.", () => {
    const r = parseStatementPage(page("January 31, 2006", "For immediate release"),
      link("https://www.federalreserve.gov/newsevents/press/monetary/20060131a.htm", "2006-01-31"), meta);
    expect(r.observation.evidence).toMatchObject({ releaseDate: "2006-01-31", releaseAt: null });
    expect(r.releaseLine).toBe("For immediate release");
  });

  it("parses the 1994–2005 legacy layout", () => {
    const html = `<font size=+1><i>Release Date: February 4, 1994</i></font><p>&nbsp;</p><font size=+1>For immediate release</font>`;
    const r = parseStatementPage(html, link("https://www.federalreserve.gov/fomc/19940204default.htm", "1994-02-04"), meta);
    expect(r.pageDate).toBe("1994-02-04");
    expect(r.observation.evidence.releaseAt).toBeNull();
  });

  it("trusts the page date over a mistyped URL date and flags it informationally", () => {
    // Real case: federalreserve.gov links the June 28, 2007 statement as monetary20070618a.htm.
    const r = parseStatementPage(page("June 28, 2007", "For immediate release"),
      link("https://www.federalreserve.gov/newsevents/pressreleases/monetary20070618a.htm", "2007-06-18"), meta);
    expect(r.observation.flags).toEqual(["SOURCE_URL_DATE_MISMATCH"]);
    expect(r.observation.evidence.releaseDate).toBe("2007-06-28");
  });
});

/** Build a real (stored + deflated) XLSX in memory so the reader is exercised end to end. */
function buildXlsx(sheetName: string, rows: (string | number)[][]): Uint8Array {
  const strings: string[] = [];
  const si = (s: string) => { let i = strings.indexOf(s); if (i < 0) { strings.push(s); i = strings.length - 1; } return i; };
  const col = (i: number) => String.fromCharCode(65 + i);
  const sheet = `<worksheet><sheetData>${rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) =>
    typeof v === "number" ? `<c r="${col(ci)}${ri + 1}"><v>${v}</v></c>` : `<c r="${col(ci)}${ri + 1}" t="s"><v>${si(v)}</v></c>`).join("")}</row>`).join("")}</sheetData></worksheet>`;
  const files: [string, string][] = [
    ["xl/workbook.xml", `<workbook><sheets><sheet name="Description" sheetId="1" r:id="rId1"/><sheet name="${sheetName}" sheetId="2" r:id="rId2"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>`],
    ["xl/worksheets/sheet1.xml", `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>About</t></is></c></row></sheetData></worksheet>`],
    ["xl/worksheets/sheet2.xml", sheet],
    ["xl/sharedStrings.xml", `<sst>${strings.map((s) => `<si><t>${s}</t></si>`).join("")}</sst>`],
  ];
  const locals: Buffer[] = []; const centrals: Buffer[] = []; let offset = 0;
  files.forEach(([name, content], i) => {
    const data = Buffer.from(content); const deflate = i % 2 === 0; const body = deflate ? deflateRawSync(data) : data;
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(deflate ? 8 : 0, 10);
    central.writeUInt32LE(body.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, body); centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  });
  const cd = Buffer.concat(centrals); const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, cd, eocd]));
}

describe("SF Fed Bauer–Swanson workbook", () => {
  it("converts Excel serials", () => {
    expect(excelSerialToIsoDay(32177)).toBe("1988-02-04");
    expect(excelSerialToIsoDay(45273)).toBe("2023-12-13");
  });

  it("emits secondary evidence with times, unscheduled flags and pre-1994 implicit markers", () => {
    const xlsx = buildXlsx("FOMC (update 2023)", [
      ["Date", "Time", "Unscheduled", "FF1"],
      [32177, "11:30am", "1", "NA"],
      [34369, "11:05am", "0", "0.1"], // 1994-02-04
      [39469, "8:30am", "1", "-0.5"], // 2008-01-22
      [45273, "2:00pm", "0", "0"], // 2023-12-13
      [45274, "", "0", "0"],
    ]);
    const res = parseSfFedWorkbook(xlsx, meta);
    expect(res.sheet).toBe("FOMC (update 2023)");
    const byDay = Object.fromEntries(res.observations.map((o) => [o.evidence.releaseDate, o]));
    expect(byDay["1988-02-04"].flags).toEqual(["IMPLICIT_ANNOUNCEMENT"]);
    expect(byDay["1994-02-04"].evidence.releaseAt).toBe("1994-02-04T16:05:00.000Z");
    expect(byDay["2008-01-22"]).toMatchObject({ unscheduled: true });
    expect(byDay["2008-01-22"].evidence.releaseAt).toBe("2008-01-22T13:30:00.000Z");
    expect(byDay["2023-12-13"].evidence).toMatchObject({ sourceKind: "SECONDARY_RESEARCH_DATASET", releaseAt: "2023-12-13T19:00:00.000Z" });
    expect(byDay["2023-12-14"].evidence.releaseAt).toBeNull();
  });

  it("fails loudly when the sheet layout changes", () => {
    expect(() => parseSfFedWorkbook(buildXlsx("FOMC (update 2023)", [["When", "Clock"]]), meta)).toThrow(/header changed/);
  });
});
