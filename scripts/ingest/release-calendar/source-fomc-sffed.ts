/**
 * SF Fed — Bauer & Swanson (2023) high-frequency monetary policy surprises.
 *
 * The workbook's FOMC sheet lists every FOMC announcement since 1988 with the
 * announcement clock time (as determined by Swanson & Jayawickrema 2022) and
 * an `Unscheduled` flag. It is peer-reviewed research, not an official Federal
 * Reserve record, so every row is SECONDARY_RESEARCH_DATASET evidence: it can
 * corroborate or fill research gaps, but can never make a timing VERIFIED.
 *
 * Before February 1994 the FOMC did not announce decisions explicitly; those
 * rows carry IMPLICIT_ANNOUNCEMENT.
 */

import type { CalendarObservation, RecordFlag } from "@/services/macro/release-calendar-records";

import { easternInstant } from "./text";
import { excelSerialToIsoDay, readWorkbook } from "./xlsx";

export const SFFED_WORKBOOK_URL =
  "https://www.frbsf.org/wp-content/uploads/monetary-policy-surprises-data.xlsx";
export const SFFED_PROVIDER_ID = "frbsf-bauer-swanson";
const SOURCE_NAME =
  "FRBSF Monetary Policy Surprises (Bauer & Swanson 2023), FOMC announcement sheet";
/** First explicit FOMC announcement (Feb 4, 1994). */
export const FIRST_EXPLICIT_ANNOUNCEMENT = "1994-02-04";

export interface SfFedParseResult {
  readonly sheet: string;
  readonly observations: CalendarObservation[];
  readonly skipped: { row: number; reason: string }[];
}

function pickSheet(sheets: Map<string, string[][]>): [string, string[][]] {
  const names = [...sheets.keys()];
  const name = names.find((n) => /^FOMC \(update/i.test(n)) ?? names.find((n) => /^FOMC/i.test(n));
  if (!name) throw new Error(`no FOMC sheet in workbook (sheets: ${names.join(", ")})`);
  return [name, sheets.get(name) ?? []];
}

export function parseSfFedWorkbook(
  buf: Uint8Array,
  meta: { retrievedAt: string; contentSha256: string },
): SfFedParseResult {
  const [sheet, rows] = pickSheet(readWorkbook(buf));
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const iDate = header.indexOf("date");
  const iTime = header.indexOf("time");
  const iUns = header.indexOf("unscheduled");
  if (iDate < 0 || iTime < 0 || iUns < 0) {
    throw new Error(`FOMC sheet header changed: ${rows[0]?.join(",")}`);
  }
  const observations: CalendarObservation[] = [];
  const skipped: { row: number; reason: string }[] = [];
  rows.slice(1).forEach((r, i) => {
    const rowNo = i + 2;
    const rawDate = (r[iDate] ?? "").trim();
    if (rawDate === "") return; // trailing blank rows
    const day = excelSerialToIsoDay(Number(rawDate));
    if (!day) { skipped.push({ row: rowNo, reason: `unparseable date ${rawDate}` }); return; }
    const rawTime = (r[iTime] ?? "").trim();
    const tm = /^(\d{1,2}):(\d{2})\s*([ap])m$/i.exec(rawTime);
    const inst = tm ? easternInstant(day, Number(tm[1]), Number(tm[2]), tm[3].toLowerCase() === "a" ? "a" : "p", null) : null;
    if (rawTime !== "" && !inst) skipped.push({ row: rowNo, reason: `unparseable time ${rawTime} (kept date)` });
    const uns = (r[iUns] ?? "").trim();
    const flags: RecordFlag[] = day < FIRST_EXPLICIT_ANNOUNCEMENT ? ["IMPLICIT_ANNOUNCEMENT"] : [];
    observations.push({
      family: "FOMC_STATEMENT",
      referencePeriodStart: day,
      releaseStage: "INITIAL",
      stageLabel: null,
      unscheduled: uns === "1" ? true : uns === "0" ? false : null,
      flags,
      evidence: {
        providerId: SFFED_PROVIDER_ID,
        sourceName: `${SOURCE_NAME} "${sheet}"`,
        sourceKind: "SECONDARY_RESEARCH_DATASET",
        sourceUrl: SFFED_WORKBOOK_URL,
        retrievedAt: meta.retrievedAt,
        releaseDate: day,
        releaseAt: inst ? inst.releaseAt.toISOString() : null,
        statedZone: null,
        evidenceText: `row ${rowNo}: Date=${day} Time=${rawTime || "(blank)"} Unscheduled=${uns || "(blank)"}`,
        contentSha256: meta.contentSha256,
      },
    });
  });
  return { sheet, observations, skipped };
}
