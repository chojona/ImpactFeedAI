/**
 * Bureau of Economic Analysis — GDP and Personal Income & Outlays timing.
 *
 * Two official sources, both on www.bea.gov (robots.txt permits; apps.bea.gov
 * does not and is never contacted):
 *   1. News-release pages (archive 1996 →). The printed embargo or wire time
 *      is intended timing: "EMBARGOED UNTIL RELEASE AT 8:30 a.m. EDT, Thursday, October
 *      29, 2026" or, in pre-2009 text releases, "FOR WIRE TRANSMISSION: 8:30
 *      A.M. EDT, THURSDAY, AUGUST 1, 1996". → OFFICIAL_RELEASE_RECORD.
 *   2. The release-schedule ICS feed (current + next year). → OFFICIAL_SCHEDULE.
 */

import type { ReleaseIdentity, ReleaseStage } from "@/services/macro/release-calendar";
import type {
  CalendarObservation,
  RecordFlag,
  ReleaseFamily,
  ScheduleChange,
} from "@/services/macro/release-calendar-records";
import { FAMILY_METRIC_KEYS, newYorkDayOf } from "@/services/macro/release-calendar-records";

import { easternInstant, htmlToText, parseMonthDayYear, parseMonthYear, parseQuarter, readClock } from "./text";

export const BEA_ORIGIN = "https://www.bea.gov";
export const BEA_ICS_URL = `${BEA_ORIGIN}/news/schedule/ics/online-calendar-subscription.ics`;
export const BEA_RELEASE_PROVIDER_ID = "bea-news-release";
export const BEA_SCHEDULE_PROVIDER_ID = "bea-release-schedule-ics";
/** www.bea.gov news-archive product filters. */
export const BEA_ARCHIVE_PRODUCTS = { BEA_GDP: 451, BEA_PERSONAL_INCOME_OUTLAYS: 476 } as const;
export const beaArchiveUrl = (product: number, page: number): string =>
  `${BEA_ORIGIN}/news/archive?field_related_product_target_id=${product}${page > 0 ? `&page=${page}` : ""}`;

export interface BeaReleaseIdentity {
  readonly family: ReleaseFamily;
  readonly referencePeriodStart: string | null;
  readonly releaseStage: ReleaseStage;
  readonly stageLabel: string | null;
  readonly identities?: readonly ReleaseIdentity[];
}

/**
 * Classify a BEA release title. Returns null for releases outside scope
 * (state/industry/territory GDP, trade, etc.). Stage wording is kept verbatim;
 * pre-2009 "preliminary"/"final" are not renamed to second/third, and the
 * Q3-2025 "Initial"/"Updated" estimates map to INITIAL/REVISION.
 */
export function classifyBeaTitle(title: string): BeaReleaseIdentity | null {
  const t = title.replace(/\s+/g, " ").trim();
  // Sub-national / territorial GDP are different releases. The national
  // "GDP (Third Estimate), GDP by Industry, …" joint release starts "GDP (" and stays.
  if (/^(GDP|Gross Domestic Product) (by|for)\b/i.test(t) ||
      /territor|samoa|guam|puerto rico|virgin islands|mariana/i.test(t)) {
    return null;
  }
  if (/personal income and outlays/i.test(t)) {
    const family = "BEA_PERSONAL_INCOME_OUTLAYS";
    const periodTitle = t.replace(/^.*outlays,?\s*/i, "");
    const pair = /^([a-z]+)(?: (\d{4}))? and ([a-z]+) (\d{4})\b/i.exec(periodTitle);
    const primary = parseMonthYear(pair ? `${pair[3]} ${pair[4]}` : periodTitle);
    const earlier = pair ? parseMonthYear(`${pair[1]} ${pair[2] ?? pair[4]}`) : null;
    const identities = earlier && primary && earlier < primary
      ? [earlier, primary].flatMap((referencePeriodStart) => FAMILY_METRIC_KEYS[family].map(
          (metricKey): ReleaseIdentity => ({ metricKey, referencePeriodStart, releaseStage: "INITIAL" }),
        ))
      : undefined;
    return { family, referencePeriodStart: primary, releaseStage: "INITIAL", stageLabel: null, ...(identities ? { identities } : {}) };
  }
  // Pre-2005 the same national monthly release was titled "Personal Income,
  // <Month YYYY>" (FRED release 54 lists those days). The 2019 shutdown split it
  // ("Personal Income, February 2019; Personal Outlays, January 2019"): PCE
  // metrics are outlays-side, so the outlays month is the reference period.
  const pi = /^personal income,?\s+([A-Za-z]{3,9}\.? \d{4})/i.exec(t);
  if (pi && !/\bby (state|county)\b|\bstate\b/i.test(t)) {
    const outlays = /personal outlays,?\s+([A-Za-z]{3,9}\.? \d{4})/i.exec(t);
    return { family: "BEA_PERSONAL_INCOME_OUTLAYS", referencePeriodStart: parseMonthYear((outlays ?? pi)[1]),
      releaseStage: "INITIAL", stageLabel: outlays ? "Personal Income / Personal Outlays (split release)" : "Personal Income" };
  }
  const corrected = /^corrected\s+/i.test(t);
  if (!/^(corrected\s+)?(gross domestic product|gdp)\b/i.test(t)) return null;
  // The stage belongs to the GDP estimate, not to bundled series: "GDP (Initial
  // Estimate) and Corporate Profits (Preliminary)" is an initial GDP estimate.
  const gdpPart = t.replace(/corporate profits[^()]{0,40}\([^)]*\)/gi, " ");
  const stages: [RegExp, ReleaseStage][] = [
    [/\badvance\b/i, "ADVANCE"],
    // BEA's post-shutdown wording for Q3 2025 (no advance estimate was published).
    [/\binitial estimate\b/i, "INITIAL"],
    [/\bsecond estimate\b/i, "SECOND_ESTIMATE"],
    [/\bthird estimate\b/i, "THIRD_ESTIMATE"],
    [/\bupdated estimate\b/i, "REVISION"],
    [/\bpreliminary\b/i, "PRELIMINARY"],
    [/\bfinal\b/i, "FINAL"],
  ];
  // "GDP and Corporate Profits, 1st quarter 2007 (preliminary)": one shared
  // label. Fall back to the whole title only when the GDP part has none.
  const source = stages.some(([re]) => re.test(gdpPart)) ? gdpPart : t;
  const hit = stages.find(([re]) => re.test(source));
  if (!hit) return null;
  const label = hit[0].exec(source)?.[0] ?? null;
  if (corrected) {
    return { family: "BEA_GDP", referencePeriodStart: parseQuarter(t), releaseStage: "REVISION", stageLabel: `Corrected ${label}` };
  }
  return { family: "BEA_GDP", referencePeriodStart: parseQuarter(t), releaseStage: hit[1], stageLabel: label };
}

/** Archive index → release-page paths (CMS listing metadata is ignored). */
export function parseBeaArchivePage(html: string): string[] {
  const paths = [...html.matchAll(/href="(\/news\/(?:19|20)\d{2}\/[a-z0-9-]+)"/gi)].map((m) => m[1]);
  return [...new Set(paths)].map((p) => `${BEA_ORIGIN}${p}`);
}

const EMBARGO_RE = /(EMBARGOED\s+UNTIL\s+RELEASE\s+AT|EMBARGOED\s+UNTIL|FOR\s+WIRE\s+TRANSMISSION:?)/i;

export interface EmbargoLine {
  readonly text: string;
  readonly releaseDate: string;
  readonly releaseAt: Date | null;
  readonly statedZone: CalendarObservation["evidence"]["statedZone"];
  readonly zoneLabelMismatch: boolean;
}

/** Parse the first embargo/wire line in plain text. */
export function parseBeaEmbargo(text: string): EmbargoLine | null {
  const m = EMBARGO_RE.exec(text);
  if (!m) return null;
  const clock = readClock(text, m.index);
  if (!clock || clock.end - m.index > m[0].length + 40) return null;
  const tail = text.slice(clock.end, clock.end + 60);
  const day = parseMonthDayYear(tail);
  if (!day) return null;
  const inst = easternInstant(day, clock.hour, clock.minute, clock.meridiem, clock.zone);
  const dateEnd = clock.end + (/\d{4}/.exec(tail)?.index ?? 0) + 4;
  return {
    text: text.slice(m.index, dateEnd).replace(/\s+/g, " ").trim(),
    releaseDate: day,
    releaseAt: inst?.releaseAt ?? null,
    statedZone: inst?.statedZone ?? null,
    zoneLabelMismatch: inst?.zoneLabelMismatch ?? false,
  };
}

export function beaReleaseTitle(html: string): string | null {
  const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => htmlToText(m[1]))
    .filter((t) => t && !/^news release$/i.test(t));
  if (h1s[0]) return h1s[0];
  const title = /<title>([^<]+)<\/title>/i.exec(html)?.[1];
  return title ? title.replace(/\s*\|.*$/, "").trim() : null;
}

/** Plain-text release attachments linked from a page (pre-2009 releases). */
export function beaTextAttachments(html: string): string[] {
  return [...new Set([...html.matchAll(/href="(\/sites\/default\/files\/newsreleases\/[^"]+\.txt)"/gi)].map((m) => `${BEA_ORIGIN}${m[1]}`))];
}

export function beaReleaseObservation(
  identity: BeaReleaseIdentity,
  embargo: EmbargoLine,
  meta: { sourceUrl: string; retrievedAt: string; contentSha256: string },
  releaseText = "",
  releaseMeta = meta,
): CalendarObservation {
  const flags: RecordFlag[] = embargo.zoneLabelMismatch ? ["ZONE_LABEL_MISMATCH"] : [];
  const scheduleChanges: ScheduleChange[] = [];
  if (identity.family === "BEA_GDP" && identity.referencePeriodStart) {
    // The December 2025 initial and January 2026 updated releases explicitly
    // name the stages they replace. A title alone cannot establish this link.
    const replacement = /\b(?:this )?(?:initial|updated) report[^.]{0,100}\breplaces the release of ([^.]+)\./i.exec(releaseText);
    if (replacement) {
      const stages = { advance: "ADVANCE", second: "SECOND_ESTIMATE", third: "THIRD_ESTIMATE" } as const;
      for (const [label, stage] of Object.entries(stages)) {
        if (stage !== identity.releaseStage && new RegExp(`\\b${label} estimate originally scheduled\\b`, "i").test(replacement[1])) {
          scheduleChanges.push({ ...releaseMeta, releaseStage: stage, disposition: "SUPERSEDED", evidenceText: replacement[0] });
        }
      }
    }
  }
  return {
    ...identity,
    unscheduled: null,
    flags,
    scheduleChanges,
    evidence: {
      providerId: BEA_RELEASE_PROVIDER_ID,
      sourceName: "U.S. Bureau of Economic Analysis — news release",
      sourceKind: "OFFICIAL_RELEASE_RECORD",
      sourceUrl: meta.sourceUrl,
      retrievedAt: meta.retrievedAt,
      releaseDate: embargo.releaseDate,
      releaseAt: embargo.releaseAt?.toISOString() ?? null,
      clockKind: "INTENDED_EMBARGO",
      statedZone: embargo.statedZone,
      evidenceText: embargo.text,
      contentSha256: meta.contentSha256,
    },
  };
}

/** RFC 5545 line unfolding + text unescaping, VEVENT blocks only. */
export function parseIcsEvents(ics: string): Record<string, string>[] {
  const unfolded = ics.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
  const events: Record<string, string>[] = [];
  for (const block of unfolded.split("BEGIN:VEVENT").slice(1)) {
    const body = block.split("END:VEVENT")[0];
    const ev: Record<string, string> = {};
    for (const line of body.split("\n")) {
      const i = line.indexOf(":");
      if (i <= 0) continue;
      const [name, ...params] = line.slice(0, i).split(";");
      ev[name.toUpperCase()] = line.slice(i + 1).replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\n/gi, " ").trim();
      if (params.length) ev[`${name.toUpperCase()};PARAMS`] = params.join(";");
    }
    events.push(ev);
  }
  return events;
}

export interface IcsParseResult {
  readonly observations: CalendarObservation[];
  readonly skipped: { summary: string; reason: string }[];
}

export function parseBeaIcs(ics: string, meta: { retrievedAt: string; contentSha256: string }): IcsParseResult {
  const observations: CalendarObservation[] = [];
  const skipped: { summary: string; reason: string }[] = [];
  const events = parseIcsEvents(ics);
  const isCancelled = (ev: Record<string, string>): boolean => ev.STATUS?.toUpperCase() === "CANCELLED";
  const activeByUid = new Map(events.filter((ev) => ev.UID && !isCancelled(ev)).map((ev) => [ev.UID, ev]));
  for (const ev of events) {
    const cancelled = isCancelled(ev);
    const retained = cancelled && ev.UID ? activeByUid.get(ev.UID) : undefined;
    const summary = ev.SUMMARY ?? retained?.SUMMARY ?? "";
    const identity = classifyBeaTitle(summary);
    if (!identity) continue;
    if (cancelled) skipped.push({ summary, reason: "cancelled" });
    const start = ev.DTSTART ?? retained?.DTSTART;
    const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(start ?? "");
    if (!dt) {
      if (!cancelled) skipped.push({ summary, reason: `DTSTART not a UTC instant: ${start ?? "(none)"}` });
      continue;
    }
    const at = new Date(Date.UTC(+dt[1], +dt[2] - 1, +dt[3], +dt[4], +dt[5], +dt[6]));
    if (at.toISOString() !== `${dt[1]}-${dt[2]}-${dt[3]}T${dt[4]}:${dt[5]}:${dt[6]}.000Z`) {
      if (!cancelled) skipped.push({ summary, reason: `invalid DTSTART: ${start}` });
      continue;
    }
    observations.push({
      ...identity,
      unscheduled: null,
      flags: [],
      evidence: {
        providerId: BEA_SCHEDULE_PROVIDER_ID,
        sourceName: "U.S. Bureau of Economic Analysis — release schedule (ICS)",
        sourceKind: "OFFICIAL_SCHEDULE",
        sourceUrl: BEA_ICS_URL,
        retrievedAt: meta.retrievedAt,
        releaseDate: newYorkDayOf(at),
        releaseAt: cancelled ? null : at.toISOString(),
        ...(cancelled ? { scheduleStatus: "CANCELLED" as const } : {}),
        ...(ev.UID ? { scheduleUid: ev.UID } : {}),
        statedZone: "UTC",
        evidenceText: [ev.SUMMARY && `SUMMARY:${ev.SUMMARY}`, ev.DTSTART && `DTSTART:${ev.DTSTART}`,
          ev.UID && `UID:${ev.UID}`, cancelled && "STATUS:CANCELLED"].filter(Boolean).join(" "),
        contentSha256: meta.contentSha256,
      },
    });
  }
  return { observations, skipped };
}
