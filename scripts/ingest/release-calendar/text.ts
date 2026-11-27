/**
 * Pure parsing helpers shared by the release-calendar source adapters.
 * No I/O. Every function returns null rather than guessing.
 */

import { createHash } from "node:crypto";

import { easternWallClock } from "@/services/macro/time";
import type { StatedZone } from "@/services/macro/release-calendar-records";

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

export function sha256(payload: string | Uint8Array): string {
  return createHash("sha256").update(payload).digest("hex");
}

export function isoDay(year: number, month: number, day: number): string | null {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return d.toISOString().slice(0, 10);
}

export function monthNumber(name: string): number | null {
  const key = name.toLowerCase().replace(/\.$/, "");
  return MONTHS[key] ?? MONTHS[key.slice(0, 3)] ?? null;
}

/** "January 11, 2024" / "JANUARY 11 2024" / "Jan. 11, 2024" → "2024-01-11". */
export function parseMonthDayYear(text: string): string | null {
  const m = /([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(text);
  if (!m) return null;
  const month = monthNumber(m[1]);
  return month ? isoDay(Number(m[3]), month, Number(m[2])) : null;
}

/** "December 2023" → "2023-12-01". */
export function parseMonthYear(text: string): string | null {
  const m = /\b([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/.exec(text);
  if (!m) return null;
  const month = monthNumber(m[1]);
  return month ? isoDay(Number(m[2]), month, 1) : null;
}

/** "3rd Quarter 2026" / "Second Quarter 1996" / "4th quarter and year 2024" → quarter start. */
export function parseQuarter(text: string): string | null {
  const words: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4 };
  const m = /\b(1st|2nd|3rd|4th|first|second|third|fourth)\s+quarter(?:\s+and\s+(?:annual|year))?,?\s+(\d{4})\b/i.exec(text);
  if (!m) return null;
  const token = m[1].toLowerCase();
  const q = words[token] ?? Number(token[0]);
  return isoDay(Number(m[2]), (q - 1) * 3 + 1, 1);
}

/** 12-hour clock to 24-hour, rejecting impossible values. */
export function to24h(hour: number, minute: number, meridiem: "a" | "p"): { h: number; m: number } | null {
  if (!Number.isInteger(hour) || hour < 1 || hour > 12 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    return null;
  }
  const h = meridiem === "a" ? (hour === 12 ? 0 : hour) : hour === 12 ? 12 : hour + 12;
  return { h, m: minute };
}

const zoneFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  timeZoneName: "short",
});

/** "EST" or "EDT" — what America/New_York actually observed at `instant`. */
export function observedEasternZone(instant: Date): "EST" | "EDT" {
  const name = zoneFormatter.formatToParts(instant).find((p) => p.type === "timeZoneName")?.value;
  return name === "EDT" ? "EDT" : "EST";
}

export interface EasternInstant {
  readonly releaseAt: Date;
  readonly statedZone: StatedZone | null;
  /** True when the publisher printed EST/EDT and it disagrees with the zone in force. */
  readonly zoneLabelMismatch: boolean;
}

/**
 * Resolve a publisher's local clock reading on a New York calendar day.
 * EST/EDT can select one occurrence of a repeated hour. For a unique wall
 * time, keep the publisher's clock and flag an outdated abbreviation.
 */
export function easternInstant(
  day: string,
  hour12: number,
  minute: number,
  meridiem: "a" | "p",
  zoneLabel: string | null,
): EasternInstant | null {
  const hm = to24h(hour12, minute, meridiem);
  if (!hm) return null;
  const label = zoneLabel ? zoneLabel.toUpperCase() : null;
  const numeric = /^(?:(?:UTC|GMT)\s*)?([+-])(\d{2}):?(\d{2})$/.exec(label ?? "");
  if (label && !numeric && label !== "EST" && label !== "EDT" && label !== "ET") return null;
  const offset = numeric && Number(numeric[2]) <= 23 && Number(numeric[3]) <= 59
    ? (numeric[1] === "-" ? -1 : 1) * (Number(numeric[2]) * 60 + Number(numeric[3]))
    : undefined;
  if (numeric && offset === undefined) return null;
  let at = easternWallClock(day, hm.h, hm.m, offset);
  if (!numeric && Number.isNaN(at.getTime()) && (label === "EST" || label === "EDT")) {
    at = easternWallClock(day, hm.h, hm.m, label === "EST" ? -300 : -240);
  }
  if (Number.isNaN(at.getTime())) return null;
  const statedZone: StatedZone | null =
    label === "EST" || label === "EDT" || label === "ET" ? label : null;
  const zoneLabelMismatch =
    (statedZone === "EST" || statedZone === "EDT") && statedZone !== observedEasternZone(at);
  return { releaseAt: at, statedZone, zoneLabelMismatch };
}

/** Matches "8:30 a.m.", "8:30 A.M.", "2:00 p.m", "10:00am". Groups: hour, minute, a|p. */
export const CLOCK_RE = /(\d{1,2}):(\d{2})\s*([AaPp])\.?\s*[Mm]\.?/;
/** Optional zone or UTC offset after a clock reading. */
export const ZONE_RE = /^\s*\(?\s*(EST|EDT|ET|(?:(?:UTC|GMT)\s*)?[+-]\d{2}:?\d{2}|UTC|GMT)\b\)?/i;

export interface ClockReading {
  readonly hour: number;
  readonly minute: number;
  readonly meridiem: "a" | "p";
  readonly zone: string | null;
  /** Index just past the clock (and zone, if any) in the input. */
  readonly end: number;
}

export function readClock(text: string, from = 0): ClockReading | null {
  const slice = text.slice(from);
  const m = CLOCK_RE.exec(slice);
  if (!m) return null;
  const after = from + m.index + m[0].length;
  const z = ZONE_RE.exec(text.slice(after));
  return {
    hour: Number(m[1]),
    minute: Number(m[2]),
    meridiem: m[3].toLowerCase() === "a" ? "a" : "p",
    zone: z ? z[1] : null,
    end: after + (z ? z[0].length : 0),
  };
}

/** Collapse HTML to whitespace-normalized text. Entities limited to those seen in sources. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;|&#0?34;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&rsquo;/g, "'")
    .replace(/&ndash;|&mdash;|&#8211;|&#8212;/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}
