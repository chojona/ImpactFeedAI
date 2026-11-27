#!/usr/bin/env tsx
/**
 * Build the historical release calendar from official sources.
 *
 * Writes JSON files only (default data/release-calendar/, gitignored).
 * No database connection is opened; nothing is written to Postgres.
 *
 *   npm run calendar:build -- --source fed --source sffed       # FOMC only
 *   npm run calendar:build -- --bls-dir ~/bls-saved              # + operator-saved BLS docs
 *   npm run calendar:build -- --offline                          # replay from cache
 *
 * Sources: fed, sffed, bea, fred, bls (bls requires --bls-dir). Default: all
 * network sources, plus bls when --bls-dir is given.
 */

import "dotenv/config";

import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import {
  mergeObservations,
  type CalendarObservation,
  type ReleaseFamily,
} from "@/services/macro/release-calendar-records";

import { AccessRefusedError, decodeLatin1, decodeUtf8, PoliteFetcher } from "./polite-fetch";
import {
  BEA_ARCHIVE_PRODUCTS, BEA_ICS_URL, beaArchiveUrl, beaReleaseObservation, beaReleaseTitle,
  beaTextAttachments, classifyBeaTitle, parseBeaArchivePage, parseBeaEmbargo, parseBeaIcs,
} from "./source-bea";
import { parseBlsArchiveIndex, parseBlsDocument, type BlsFileName } from "./source-bls-local";
import {
  FED_CALENDAR_URL, fedHistoricalYearUrl, parseCalendarPage, parseHistoricalYearPage,
  parseStatementPage, type StatementLink,
} from "./source-fomc-fed";
import { parseSfFedWorkbook, SFFED_WORKBOOK_URL } from "./source-fomc-sffed";
import { FRED_RELEASE_IDS, fredReleaseDatesUrl, parseFredReleaseDates, reconcileWithFred } from "./source-fred";
import { htmlToText, sha256 } from "./text";

type SourceName = "fed" | "sffed" | "bea" | "fred" | "bls";

interface SourceReport {
  status: "ok" | "partial" | "failed" | "skipped";
  observations: number;
  notes: string[];
}

const { values } = parseArgs({
  options: {
    source: { type: "string", multiple: true },
    "fed-from": { type: "string", default: "1994" },
    "bea-from": { type: "string", default: "1996" },
    "bls-dir": { type: "string" },
    out: { type: "string", default: "data/release-calendar" },
    offline: { type: "boolean", default: false },
    "min-interval-ms": { type: "string", default: "2000" },
  },
});

const outDir = path.resolve(values.out ?? "data/release-calendar");
const fetcher = new PoliteFetcher({
  cacheDir: path.join(outDir, "cache"),
  offline: values.offline,
  minIntervalMs: Number(values["min-interval-ms"]),
});
const requested = new Set<SourceName>(
  (values.source as SourceName[] | undefined) ??
    (["fed", "sffed", "bea", "fred", ...(values["bls-dir"] ? ["bls"] : [])] as SourceName[]),
);
const reports: Partial<Record<SourceName, SourceReport>> = {};
const observations: CalendarObservation[] = [];
const log = (msg: string): void => console.log(msg);

function noteRefusal(rep: SourceReport, err: unknown): void {
  if (err instanceof AccessRefusedError) {
    rep.status = rep.observations > 0 ? "partial" : "failed";
    rep.notes.push(err.message);
  } else {
    throw err;
  }
}

async function runFed(): Promise<void> {
  const rep: SourceReport = { status: "ok", observations: 0, notes: [] };
  reports.fed = rep;
  const links: StatementLink[] = [];
  try {
    for (let y = Number(values["fed-from"]); y <= new Date().getUTCFullYear(); y++) {
      let doc;
      try {
        doc = await fetcher.get(fedHistoricalYearUrl(y));
      } catch (err) {
        if (err instanceof AccessRefusedError && err.status === 404) break; // year not yet archived
        throw err;
      }
      const found = parseHistoricalYearPage(decodeUtf8(doc.body));
      links.push(...found);
      log(`[fed] ${y}: ${found.length} statements`);
    }
    const cal = parseCalendarPage(decodeUtf8((await fetcher.get(FED_CALENDAR_URL)).body));
    links.push(...cal);
    log(`[fed] calendar page: ${cal.length} statements`);
    const unique = [...new Map(links.map((l) => [l.url, l])).values()]
      .filter((l) => l.urlDate >= `${values["fed-from"]}-01-01`);
    for (const link of unique) {
      const doc = await fetcher.get(link.url);
      const parsed = parseStatementPage(decodeUtf8(doc.body), link, {
        retrievedAt: doc.retrievedAt, contentSha256: doc.contentSha256, finalUrl: doc.finalUrl,
      });
      observations.push(parsed.observation);
      rep.observations++;
      if (!parsed.releaseLine) rep.notes.push(`no release line: ${link.url}`);
    }
  } catch (err) {
    noteRefusal(rep, err);
  }
}

async function runSfFed(): Promise<void> {
  const rep: SourceReport = { status: "ok", observations: 0, notes: [] };
  reports.sffed = rep;
  try {
    const doc = await fetcher.get(SFFED_WORKBOOK_URL);
    const parsed = parseSfFedWorkbook(doc.body, { retrievedAt: doc.retrievedAt, contentSha256: doc.contentSha256 });
    observations.push(...parsed.observations);
    rep.observations = parsed.observations.length;
    rep.notes.push(`sheet "${parsed.sheet}"`, ...parsed.skipped.map((s) => `row ${s.row}: ${s.reason}`));
  } catch (err) {
    noteRefusal(rep, err);
  }
}

async function runBea(): Promise<void> {
  const rep: SourceReport = { status: "ok", observations: 0, notes: [] };
  reports.bea = rep;
  try {
    const ics = await fetcher.get(BEA_ICS_URL);
    const parsed = parseBeaIcs(decodeUtf8(ics.body), { retrievedAt: ics.retrievedAt, contentSha256: ics.contentSha256 });
    observations.push(...parsed.observations);
    rep.observations += parsed.observations.length;
    rep.notes.push(...parsed.skipped.map((s) => `ICS skipped "${s.summary}": ${s.reason}`));

    const fromYear = Number(values["bea-from"]);
    for (const [family, product] of Object.entries(BEA_ARCHIVE_PRODUCTS) as [ReleaseFamily, number][]) {
      const pages = new Set<string>();
      for (let page = 0; page < 80; page++) {
        const found = parseBeaArchivePage(decodeUtf8((await fetcher.get(beaArchiveUrl(product, page))).body));
        const fresh = found.filter((u) => !pages.has(u));
        fresh.forEach((u) => pages.add(u));
        const oldest = Math.min(...found.map((u) => Number(/\/news\/(\d{4})\//.exec(u)?.[1] ?? 9999)));
        if (fresh.length === 0 || oldest < fromYear) break;
      }
      log(`[bea] ${family}: ${pages.size} release pages in archive listing`);
      for (const url of [...pages].sort()) {
        const year = Number(/\/news\/(\d{4})\//.exec(url)?.[1]);
        if (year < fromYear) continue;
        const doc = await fetcher.get(url);
        const html = decodeUtf8(doc.body);
        const title = beaReleaseTitle(html);
        const identity = title ? classifyBeaTitle(title) : null;
        if (!identity || identity.family !== family) continue;
        const releaseText = htmlToText(html);
        let embargo = parseBeaEmbargo(releaseText);
        const releaseMeta = { sourceUrl: doc.finalUrl, retrievedAt: doc.retrievedAt, contentSha256: doc.contentSha256 };
        let cite = releaseMeta;
        if (!embargo) {
          for (const txtUrl of beaTextAttachments(html)) {
            const txt = await fetcher.get(txtUrl);
            embargo = parseBeaEmbargo(decodeLatin1(txt.body).replace(/\s+/g, " "));
            if (embargo) { cite = { sourceUrl: txt.finalUrl, retrievedAt: txt.retrievedAt, contentSha256: txt.contentSha256 }; break; }
          }
        }
        if (!embargo) { rep.notes.push(`no embargo/wire line: ${url} (${title})`); continue; }
        observations.push(beaReleaseObservation(identity, embargo, cite, releaseText, releaseMeta));
        rep.observations++;
      }
    }
  } catch (err) {
    noteRefusal(rep, err);
  }
}

async function runBls(): Promise<void> {
  const rep: SourceReport = { status: "ok", observations: 0, notes: [] };
  reports.bls = rep;
  const dir = values["bls-dir"];
  if (!dir) { rep.status = "skipped"; rep.notes.push("no --bls-dir given; BLS is never fetched"); return; }
  const expected: BlsFileName[] = [];
  const seen = new Set<string>();
  for (const fileName of (await readdir(dir)).sort()) {
    const full = path.join(dir, fileName);
    const buf = await readFile(full);
    if (/^(cpi|ppi|empsit)\.html?$/i.test(fileName)) { expected.push(...parseBlsArchiveIndex(buf.toString("utf8"))); continue; }
    const savedAt = (await stat(full)).mtime.toISOString();
    const content = /\.txt$/i.test(fileName) ? decodeLatin1(buf) : buf.toString("utf8");
    const res = parseBlsDocument({ fileName, content, savedAt, contentSha256: sha256(buf) });
    if (res.kind === "skipped") { rep.notes.push(`${res.fileName}: ${res.reason}`); continue; }
    observations.push(res.observation);
    seen.add(`${res.observation.family}|${res.observation.evidence.releaseDate}`);
    rep.observations++;
  }
  const missing = expected.filter((e) => !seen.has(`${e.family}|${e.releaseDate}`));
  if (expected.length) rep.notes.push(`archive index lists ${expected.length} releases; ${missing.length} not supplied`);
  if (missing.length) rep.status = "partial";
}

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });
  if (requested.has("fed")) await runFed();
  if (requested.has("sffed")) await runSfFed();
  if (requested.has("bea")) await runBea();
  if (requested.has("bls")) await runBls();

  const records = mergeObservations(observations);
  const reconciliation = [];
  if (requested.has("fred")) {
    const rep: SourceReport = { status: "ok", observations: 0, notes: [] };
    reports.fred = rep;
    const key = process.env.FRED_API_KEY;
    if (!key) { rep.status = "skipped"; rep.notes.push("FRED_API_KEY not set"); }
    else {
      try {
        for (const [family, id] of Object.entries(FRED_RELEASE_IDS) as [ReleaseFamily, number][]) {
          const dates = parseFredReleaseDates(decodeUtf8((await fetcher.get(fredReleaseDatesUrl(id, key))).body));
          reconciliation.push(reconcileWithFred(family, records, dates));
        }
      } catch (err) {
        noteRefusal(rep, err);
      }
    }
  }

  const counts: Record<string, Record<string, number>> = {};
  for (const r of records) {
    counts[r.family] ??= {};
    counts[r.family][r.timingStatus] = (counts[r.family][r.timingStatus] ?? 0) + 1;
  }
  const write = (name: string, data: unknown) => writeFile(path.join(outDir, name), `${JSON.stringify(data, null, 2)}\n`);
  await write("observations.json", observations);
  await write("records.json", records);
  await write("reconciliation.json", reconciliation);
  await write("run-report.json", { generatedAt: new Date().toISOString(), offline: values.offline, sources: reports, counts });

  log("\nRecords by family and timing status:");
  console.table(counts);
  for (const [name, rep] of Object.entries(reports)) {
    log(`[${name}] ${rep.status}: ${rep.observations} observations${rep.notes.length ? `, ${rep.notes.length} notes` : ""}`);
  }
  for (const r of reconciliation) {
    log(`[fred] ${r.family}: ${r.matched}/${r.officialCount} official days matched; ${r.officialOnly.length} official-only, ${r.fredOnly.length} FRED-only in window`);
  }
  log(`\nWrote ${path.relative(process.cwd(), outDir)}/{records,observations,reconciliation,run-report}.json`);
  if (Object.values(reports).some((r) => r.status === "failed")) process.exitCode = 1;
}

void main();
