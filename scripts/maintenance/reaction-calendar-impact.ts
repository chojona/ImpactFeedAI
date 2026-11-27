#!/usr/bin/env tsx
/** Dry-run only: compare calendar assignments using captured source-event /
 * SPY-calendar evidence and frozen stored prices. Does NOT claim full source
 * price replay; original daily/intraday series were not archived in v3.
 */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { buildSessionCalendar, resolveReleaseSession, type SessionCalendar } from "@/services/market/sessionCalendar";
import { economicCloseInstant } from "@/services/market/sessionBasis";
import { easternWallClock } from "@/services/macro/time";
import { sessionOffsetFor, type ReactionMeasure } from "@/services/events/reactionMeasures";
import { reactionTimingEligibility, type ReactionTimingInput } from "@/services/events/timing";
import type { VerificationRow, CalendarEvidence } from "@/services/events/measurementCoverage";

export const FALSE_EARLY_CLOSES = ["2022-07-01", "2022-12-23", "2026-07-02"];
/** Exact early-close delta relative to repository baseline 3fe1585. */
export function baselineCalendar(days: readonly string[]): SessionCalendar {
  const corrected = buildSessionCalendar(days);
  const isEarlyClose = (day: string) => FALSE_EARLY_CLOSES.includes(day) || corrected.isEarlyClose(day);
  return { ...corrected, isEarlyClose, closeInstant: (day, options) => easternWallClock(day, options?.honourEarlyClose && isEarlyClose(day) ? 13 : 16, 0) };
}

export function compareCalendarAssignments(input: {
  events: readonly (ReactionTimingInput & { id: string })[];
  rows: readonly VerificationRow[];
  calendars: Record<string, CalendarEvidence>;
}) {
  const changedObservations: { id: string; eventId: string; symbol: string; measure: string; before: unknown; after: unknown; investigation: string }[] = [];
  const eventComparisons: { eventId: string; before: unknown; after: unknown }[] = [];
  const incompleteEvents: string[] = [];
  for (const event of input.events.filter(e => reactionTimingEligibility(e).eligible)) {
    const evidence = input.calendars[event.id];
    if (evidence?.status !== "ok" || !evidence.days.length) { incompleteEvents.push(event.id); continue; }
    const before = baselineCalendar(evidence.days), after = buildSessionCalendar(evidence.days);
    const oldOrigin = resolveReleaseSession(before, event.releaseAt!);
    const newOrigin = resolveReleaseSession(after, event.releaseAt!);
    const assignments = (calendar: SessionCalendar, release: typeof oldOrigin, measure: ReactionMeasure) => {
      if (release.status !== "resolved") return release;
      const offset = sessionOffsetFor(measure);
      return { releaseSessionDay: release.day, anchorSessionDay: offset === null ? release.day : calendar.dayAt(release.index - 1), endpointSessionDay: offset === null ? release.day : calendar.dayAt(release.index + offset) };
    };
    eventComparisons.push({ eventId: event.id, before: oldOrigin, after: newOrigin });
    for (const row of input.rows.filter(r => r.eventId === event.id)) {
      const economicBound = (calendar: SessionCalendar) => row.measure === "INTRADAY_60M" ? row.anchorBarAt.toISOString() : economicCloseInstant({ basis: row.sessionBasis, sessionDay: row.anchorSessionDay, barAt: row.anchorBarAt, isEarlyClose: calendar.isEarlyClose(row.anchorSessionDay) }).toISOString();
      const prior = { ...assignments(before, oldOrigin, row.measure), anchorCompletionBound: economicBound(before) };
      const corrected = { ...assignments(after, newOrigin, row.measure), anchorCompletionBound: economicBound(after) };
      if (JSON.stringify(prior) !== JSON.stringify(corrected)) changedObservations.push({ id: row.id, eventId: row.eventId, symbol: row.symbol, measure: row.measure, before: prior, after: corrected, investigation: "Calendar correction changes selection or completion bounds. Original full source series required for additive recomputation; retain v3 and block cutover." });
    }
  }
  const exposures = input.rows.filter(r => [r.anchorSessionDay, r.endpointSessionDay, r.releaseSessionDay].some(d => FALSE_EARLY_CLOSES.includes(d))).map(r => r.id);
  return { mode: "dry_run_no_writes", baselineCommit: "3fe158504a22f765105e2a0aa7697bccaa3d7acc", candidateCalculationVersion: 4,
    observedRows: input.rows.length, checkedEvents: eventComparisons.length, incompleteEvents,
    disputedDateExposures: exposures, changedObservedRows: changedObservations.length, changedObservations, eventComparisons,
    fullPriceReplay: "unavailable_original_input_series_not_archived",
    historicalReturnDelta: "not_recomputed_from_source_prices",
    applyAuthorized: false, liveReadCutoverAuthorized: false,
    requiredNextStep: "Archive inputs; replay v4 additively on an isolated database, investigate every price/basis/coverage difference, obtain acceptance before live cutover.",
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== "--snapshot" || args[2] !== "--report") throw new Error("Usage: --snapshot <file> --report <file>");
  const raw = await readFile(args[1], "utf8");
  const snapshot = JSON.parse(raw);
  const report = compareCalendarAssignments({ ...snapshot, events: snapshot.events.map((e: ReactionTimingInput) => ({ ...e, releaseAt: e.releaseAt === null ? null : new Date(e.releaseAt) })), rows: snapshot.rows.map((r: VerificationRow) => ({ ...r, anchorBarAt: new Date(r.anchorBarAt), endpointBarAt: new Date(r.endpointBarAt) })) });
  const output = { generatedAt: new Date().toISOString(), sourceSnapshotSha256: createHash("sha256").update(raw).digest("hex"), ...report };
  await writeFile(args[3], JSON.stringify(output, null, 2) + "\n");
  console.log(JSON.stringify(output, null, 2));
  if (report.incompleteEvents.length) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error("Calendar impact report incomplete; check snapshot and output path."); process.exitCode = 1; });
