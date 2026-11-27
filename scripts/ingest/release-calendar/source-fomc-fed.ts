/**
 * Federal Reserve Board — official FOMC statement archive.
 *
 * Discovery: fomchistoricalYYYY.htm (≤ 5 years ago) and fomccalendars.htm
 * (recent years). A link whose text is exactly "Statement" (historical pages)
 * or the HTML link under "Statement:" (calendar page) is the policy statement;
 * the announcement day is encoded in its URL.
 *
 * Timing: each statement page is an OFFICIAL_RELEASE_RECORD. From 2016 the
 * page prints "For release at 2:00 p.m. EDT" (VERIFIED instant); earlier pages
 * print "For immediate release" plus a date (DATE_ONLY). No hour is inferred.
 */

import type { CalendarObservation, RecordFlag } from "@/services/macro/release-calendar-records";

import { easternInstant, htmlToText, isoDay, parseMonthDayYear, readClock } from "./text";

export const FED_ORIGIN = "https://www.federalreserve.gov";
export const FED_PROVIDER_ID = "fed-fomc-statement";
export const fedHistoricalYearUrl = (year: number): string =>
  `${FED_ORIGIN}/monetarypolicy/fomchistorical${year}.htm`;
export const FED_CALENDAR_URL = `${FED_ORIGIN}/monetarypolicy/fomccalendars.htm`;

export interface StatementLink {
  readonly url: string;
  /** Announcement day encoded in the URL. */
  readonly urlDate: string;
  /** Panel heading, e.g. "March 15 Unscheduled Meeting - 2020"; null if unknown. */
  readonly heading: string | null;
  readonly unscheduled: boolean | null;
}

function dateFromUrl(url: string): string | null {
  // First run of 8 digits: ".../monetary20240131a.htm", ".../1997/19970325/".
  const m = /(?<!\d)(\d{4})(\d{2})(\d{2})(?!\d)/.exec(url);
  return m ? isoDay(Number(m[1]), Number(m[2]), Number(m[3])) : null;
}

export function classifyHeading(heading: string): boolean | null {
  if (/unscheduled|conference call|notation vote/i.test(heading)) return true;
  if (/\bmeeting\b/i.test(heading)) return false;
  return null;
}

const absolute = (href: string): string =>
  href.startsWith("http") ? href.replace(/^http:/, "https:") : `${FED_ORIGIN}${href.startsWith("/") ? "" : "/"}${href}`;

/** Policy-statement links on one fomchistoricalYYYY.htm page. */
export function parseHistoricalYearPage(html: string): StatementLink[] {
  const out: StatementLink[] = [];
  for (const block of html.split(/<h5\b[^>]*>/i).slice(1)) {
    const heading = htmlToText(block.split(/<\/h5>/i)[0]);
    for (const m of block.matchAll(/<a\s+href="([^"]+)"[^>]*>\s*Statement\s*<\/a>/gi)) {
      const urlDate = dateFromUrl(m[1]);
      if (!urlDate) continue;
      out.push({ url: absolute(m[1]), urlDate, heading, unscheduled: classifyHeading(heading) });
    }
  }
  return dedupeLinks(out);
}

/** Policy-statement links on fomccalendars.htm (recent years). */
export function parseCalendarPage(html: string): StatementLink[] {
  const out: StatementLink[] = [];
  const blocks = html.split(/class="[^"]*\bfomc-meeting\b(?![-_])[^"]*"/i).slice(1);
  for (const block of blocks) {
    const stmt = /<strong>\s*Statement:\s*<\/strong>([\s\S]*?)<\/div>/i.exec(block);
    if (!stmt) continue;
    const href = /href="([^"]*monetary\d{8}a\.htm)"/i.exec(stmt[1])?.[1];
    if (!href) continue;
    const urlDate = dateFromUrl(href);
    if (!urlDate) continue;
    const dateCell = /fomc-meeting__date[^>]*>([\s\S]*?)<\/div>/i.exec(block)?.[1] ?? "";
    const label = htmlToText(dateCell);
    out.push({
      url: absolute(href),
      urlDate,
      heading: label || null,
      unscheduled: /unscheduled|notation/i.test(label) ? true : label ? false : null,
    });
  }
  return dedupeLinks(out);
}

function dedupeLinks(links: StatementLink[]): StatementLink[] {
  const seen = new Map<string, StatementLink>();
  for (const l of links) if (!seen.has(l.url)) seen.set(l.url, l);
  return [...seen.values()];
}

export interface StatementTiming {
  readonly pageDate: string | null;
  readonly releaseLine: string | null;
  readonly observation: CalendarObservation;
}

/** Parse one statement page into an official observation. */
export function parseStatementPage(
  html: string,
  link: StatementLink,
  meta: { retrievedAt: string; contentSha256: string; finalUrl?: string },
): StatementTiming {
  const timeCell = /class="article__time"[^>]*>([\s\S]*?)<\//i.exec(html)?.[1];
  const legacyDate = /Release Date:\s*([A-Za-z]+\.? \d{1,2},? \d{4})/i.exec(htmlToText(html))?.[1];
  const pageDate = parseMonthDayYear(timeCell ? htmlToText(timeCell) : legacyDate ?? "");

  const relCell = /class="releaseTime"[^>]*>([\s\S]*?)<\//i.exec(html)?.[1];
  const text = relCell ? htmlToText(relCell) : htmlToText(html);
  const relMatch = /For (?:immediate )?release(?: at [^.]*?[ap]\.?\s*m\.?\s*\(?(?:EST|EDT|ET|(?:(?:UTC|GMT)\s*)?[+-]\d{2}:?\d{2}|UTC|GMT)?\)?)?/i.exec(text);
  const releaseLine = relMatch ? relMatch[0].trim() : null;

  const flags: RecordFlag[] = [];
  const releaseDate = pageDate ?? link.urlDate;
  // The page's own date is the record; the URL is discovery metadata. The Fed
  // links its June 28, 2007 statement as monetary20070618a.htm, for example.
  if (pageDate && pageDate !== link.urlDate) flags.push("SOURCE_URL_DATE_MISMATCH");

  let releaseAt: string | null = null;
  let statedZone: CalendarObservation["evidence"]["statedZone"] = null;
  if (releaseLine && /release at/i.test(releaseLine)) {
    const clock = readClock(releaseLine);
    const inst = clock ? easternInstant(releaseDate, clock.hour, clock.minute, clock.meridiem, clock.zone) : null;
    if (inst) {
      releaseAt = inst.releaseAt.toISOString();
      statedZone = inst.statedZone;
      if (inst.zoneLabelMismatch) flags.push("ZONE_LABEL_MISMATCH");
    }
  }
  const evidenceText = [
    pageDate ? `page date: ${pageDate}` : `page date missing; URL date ${link.urlDate}`,
    releaseLine ?? "no release line",
    link.heading ? `heading: ${link.heading}` : null,
  ].filter(Boolean).join(" | ");

  return {
    pageDate,
    releaseLine,
    observation: {
      family: "FOMC_STATEMENT",
      referencePeriodStart: releaseDate,
      releaseStage: "INITIAL",
      stageLabel: null,
      unscheduled: link.unscheduled,
      flags,
      evidence: {
        providerId: FED_PROVIDER_ID,
        sourceName: "Board of Governors of the Federal Reserve System — FOMC statement",
        sourceKind: "OFFICIAL_RELEASE_RECORD",
        sourceUrl: (meta.finalUrl ?? link.url).replace(/^http:/, "https:"),
        retrievedAt: meta.retrievedAt,
        releaseDate,
        releaseAt,
        ...(/release at/i.test(releaseLine ?? "") ? { clockKind: "INTENDED_EMBARGO" as const } : {}),
        statedZone,
        evidenceText,
        contentSha256: meta.contentSha256,
      },
    },
  };
}
