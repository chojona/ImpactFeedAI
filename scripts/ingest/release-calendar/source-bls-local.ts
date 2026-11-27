/**
 * BLS — CPI, PPI and Employment Situation release timing from OPERATOR-SAVED
 * archive documents. This adapter performs no network I/O.
 *
 * www.bls.gov blocks non-browser clients and prohibits bot activity outside
 * BLS usage policy, so ImpactFeedAI never fetches it. An operator saves the
 * archived releases in a browser (keeping BLS's file names, e.g.
 * cpi_01112024.htm, empsit_02022024.htm, ppi_12122023.htm, or the pre-2008
 * cpi_07151999.txt) into one directory; optionally the archive index pages
 * (cpi.htm, empsit.htm, ppi.htm) too, which enables a completeness report.
 *
 * Evidence per release:
 *   - the archive file name encodes the release day (official naming);
 *   - the embargo line states the instant: "embargoed until 8:30 a.m. (ET)
 *     Thursday, January 11, 2024" / "UNTIL 8:30 A.M. (EDT) … July 15, 1999".
 * The reference period is read from the release title only — shutdown-delayed
 * releases (e.g. September 2025 payrolls on 2025-11-20) make "previous month"
 * inference wrong, so an unreadable title yields null + REFERENCE_PERIOD_UNKNOWN.
 */

import type {
  CalendarObservation,
  RecordFlag,
  ReleaseFamily,
} from "@/services/macro/release-calendar-records";

import { easternInstant, htmlToText, isoDay, parseMonthDayYear, parseMonthYear, readClock } from "./text";

export const BLS_PROVIDER_ID = "bls-archive-operator-saved";

const PREFIX_FAMILY: Record<string, ReleaseFamily> = {
  cpi: "BLS_CPI",
  ppi: "BLS_PPI",
  empsit: "BLS_EMPLOYMENT_SITUATION",
};

export interface BlsFileName {
  readonly family: ReleaseFamily;
  readonly prefix: string;
  readonly releaseDate: string;
  readonly extension: "htm" | "txt" | "pdf";
  /** Canonical BLS archive URL for this document. */
  readonly url: string;
}

/** "cpi_01112024.htm" → identity + canonical citation URL. */
export function parseBlsFileName(name: string): BlsFileName | null {
  const m = /^(cpi|ppi|empsit)_(\d{2})(\d{2})(\d{4})\.(htm|html|txt|pdf)$/i.exec(name.trim());
  if (!m) return null;
  const day = isoDay(Number(m[4]), Number(m[2]), Number(m[3]));
  if (!day) return null;
  const prefix = m[1].toLowerCase();
  const ext = m[5].toLowerCase() === "html" ? "htm" : (m[5].toLowerCase() as "htm" | "txt" | "pdf");
  const base = `${prefix}_${m[2]}${m[3]}${m[4]}.${ext}`;
  const folder = ext === "txt" ? "history" : "archives";
  return { family: PREFIX_FAMILY[prefix], prefix, releaseDate: day, extension: ext,
    url: `https://www.bls.gov/news.release/${folder}/${base}` };
}

const TITLE_PATTERNS: Record<ReleaseFamily, RegExp[]> = {
  BLS_CPI: [/CONSUMER PRICE INDEX\s*[-:\u2013\u2014]+\s*([A-Z]{3,9}\.? \d{4})/i],
  BLS_PPI: [/PRODUCER PRICE INDEX(?:ES)?\s*[-:\u2013\u2014]+\s*([A-Z]{3,9}\.? \d{4})/i],
  BLS_EMPLOYMENT_SITUATION: [/THE EMPLOYMENT SITUATION\s*[-:\u2013\u2014]+\s*([A-Z]{3,9}\.? \d{4})/i],
  BEA_GDP: [],
  BEA_PERSONAL_INCOME_OUTLAYS: [],
  FOMC_STATEMENT: [],
};

/** Reference month from the release title, or null. Never inferred from the release date. */
export function blsReferencePeriod(family: ReleaseFamily, text: string): string | null {
  const head = text.slice(0, 6000);
  const results = /\b(\d{4}) M(\d{2}) Results\b/.exec(head);
  if (results) return isoDay(Number(results[1]), Number(results[2]), 1);
  for (const re of TITLE_PATTERNS[family]) {
    const m = re.exec(head);
    if (m) return parseMonthYear(m[1]);
  }
  return null;
}

export interface BlsEmbargo {
  readonly text: string;
  readonly releaseDate: string;
  readonly releaseAt: Date;
  readonly statedZone: CalendarObservation["evidence"]["statedZone"];
  readonly zoneLabelMismatch: boolean;
}

/**
 * The embargo statement at the head of a release. Bounded windows keep a later
 * "next release is scheduled for … 8:30 a.m." sentence from being picked up.
 */
export function parseBlsEmbargo(text: string): BlsEmbargo | null {
  const m = /EMBARGOED/i.exec(text);
  if (!m) return null;
  const clock = readClock(text, m.index);
  if (!clock || clock.end - m.index > 140) return null;
  const between = text.slice(clock.end, clock.end + 160);
  if (/next release|scheduled/i.test(between.split(/\d{4}/)[0] ?? "")) return null;
  const day = parseMonthDayYear(between);
  if (!day) return null;
  const inst = easternInstant(day, clock.hour, clock.minute, clock.meridiem, clock.zone);
  if (!inst) return null;
  const yearAt = /\d{4}/.exec(between);
  const end = clock.end + (yearAt ? yearAt.index + 4 : 0);
  return { text: text.slice(m.index, end).replace(/\s+/g, " ").trim(), releaseDate: day,
    releaseAt: inst.releaseAt, statedZone: inst.statedZone, zoneLabelMismatch: inst.zoneLabelMismatch };
}

export interface BlsDocumentInput {
  readonly fileName: string;
  readonly content: string;
  /** When the operator saved the document (manifest or file mtime). */
  readonly savedAt: string;
  readonly contentSha256: string;
  /** Optional URL from a manifest; must be the bls.gov archive URL. */
  readonly sourceUrl?: string;
}

export type BlsDocumentResult =
  | { readonly kind: "observation"; readonly observation: CalendarObservation }
  | { readonly kind: "skipped"; readonly fileName: string; readonly reason: string };

export function parseBlsDocument(doc: BlsDocumentInput): BlsDocumentResult {
  const name = parseBlsFileName(doc.fileName);
  if (!name) return { kind: "skipped", fileName: doc.fileName, reason: "not a BLS archive file name" };
  if (name.extension === "pdf") return { kind: "skipped", fileName: doc.fileName, reason: "PDF not parsed; save the HTML/TXT version" };
  const text = name.extension === "txt" ? doc.content.replace(/\s+/g, " ") : htmlToText(doc.content);
  if (/Access Denied|page you are looking for cannot be found/i.test(text.slice(0, 2000))) {
    return { kind: "skipped", fileName: doc.fileName, reason: "saved file is an error page, not a release" };
  }
  const sourceUrl = doc.sourceUrl ?? name.url;
  if (!/^https:\/\/www\.bls\.gov\/news\.release\//.test(sourceUrl)) {
    return { kind: "skipped", fileName: doc.fileName, reason: `source URL is not a BLS archive URL: ${sourceUrl}` };
  }
  const embargo = parseBlsEmbargo(text);
  const flags: RecordFlag[] = [];
  const referencePeriodStart = blsReferencePeriod(name.family, text);
  if (embargo?.zoneLabelMismatch) flags.push("ZONE_LABEL_MISMATCH");
  if (embargo && embargo.releaseDate !== name.releaseDate) flags.push("DATE_CONFLICT");

  return {
    kind: "observation",
    observation: {
      family: name.family,
      referencePeriodStart,
      releaseStage: "INITIAL",
      stageLabel: null,
      unscheduled: null,
      flags,
      evidence: {
        providerId: BLS_PROVIDER_ID,
        sourceName: "U.S. Bureau of Labor Statistics — news release archive (operator-saved copy)",
        sourceKind: "OFFICIAL_RELEASE_RECORD",
        sourceUrl,
        retrievedAt: doc.savedAt,
        releaseDate: embargo?.releaseDate ?? name.releaseDate,
        releaseAt: embargo ? embargo.releaseAt.toISOString() : null,
        statedZone: embargo?.statedZone ?? null,
        evidenceText: embargo
          ? `${embargo.text} | file ${doc.fileName}`
          : `no embargo line found; release day from archive file name ${doc.fileName}`,
        contentSha256: doc.contentSha256,
      },
    },
  };
}

/** Archive index (cpi.htm / empsit.htm / ppi.htm) → expected release days per family. */
export function parseBlsArchiveIndex(html: string): BlsFileName[] {
  const names = [...html.matchAll(/news\.release\/(?:archives|history)\/((?:cpi|ppi|empsit)_\d{8}\.(?:htm|txt|pdf))/gi)]
    .map((m) => parseBlsFileName(m[1]))
    .filter((n): n is BlsFileName => n !== null);
  const byDay = new Map<string, BlsFileName>();
  for (const n of names) {
    const k = `${n.family}|${n.releaseDate}`;
    const prev = byDay.get(k);
    if (!prev || (prev.extension === "pdf" && n.extension !== "pdf")) byDay.set(k, n);
  }
  return [...byDay.values()].sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
}
