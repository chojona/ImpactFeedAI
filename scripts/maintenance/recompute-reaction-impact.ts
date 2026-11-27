#!/usr/bin/env tsx
/** Fresh-source additive v4 plan. Never creates a database client or writes rows.
 * Captures transformed provider inputs for deterministic offline recomputation.
 */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createYahooMeasurementProvider, type SeriesFetchOutcome } from "../ingest/measurement-provider";
import { ASSET_UNIVERSE } from "../ingest/events-seed";
import { resolveSessionMeasurements, resolveIntradayMeasurement, type ResolvedMeasurement } from "@/services/events/reactionMeasurement";
import { reactionTimingEligibility, COMPUTED_REACTION_CALCULATION_VERSION } from "@/services/events/timing";
import { buildSessionCalendar, resolveReleaseSession } from "@/services/market/sessionCalendar";
import { measurementKey, type VerificationEvent, type VerificationRow } from "@/services/events/measurementCoverage";

interface CapturedPair { eventId: string; symbol: string; releaseAt: Date; fetchedAt: string; outcome: SeriesFetchOutcome }
const fingerprint = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const dateFields = (m: ResolvedMeasurement | VerificationRow) => ({ measure: m.measure, anchorKind: m.anchorKind, anchorPrice: m.anchorPrice, anchorBarAt: m.anchorBarAt.toISOString(), anchorSessionDay: m.anchorSessionDay, endpointPrice: m.endpointPrice, endpointBarAt: m.endpointBarAt.toISOString(), endpointSessionDay: m.endpointSessionDay, releaseSessionDay: m.releaseSessionDay, pctChange: m.pctChange, priceBasis: m.priceBasis, sessionBasis: m.sessionBasis });

export function planRecomputedImpact(events: readonly VerificationEvent[], rows: readonly VerificationRow[], pairs: readonly CapturedPair[]) {
  const candidates = new Map<string, ReturnType<typeof dateFields>>();
  const unavailable: { key: string; reason: string }[] = [];
  const incomplete: string[] = [];
  for (const event of events.filter(e => reactionTimingEligibility(e).eligible)) {
    const eventPairs = pairs.filter(p => p.eventId === event.id);
    const spy = eventPairs.find(p => p.symbol === "SPY")?.outcome;
    if (spy?.status !== "ok" || !spy.series.daily.length) { incomplete.push(event.id); continue; }
    const calendar = buildSessionCalendar(spy.series.daily.map(b => b.sessionDay));
    const origin = resolveReleaseSession(calendar, event.releaseAt!);
    for (const symbol of ASSET_UNIVERSE) {
      const pair = eventPairs.find(p => p.symbol === symbol);
      if (pair?.outcome.status !== "ok") { incomplete.push(`${event.id}/${symbol}`); continue; }
      const session = resolveSessionMeasurements({ symbol, releaseAt: event.releaseAt!, calendar, daily: pair.outcome.series.daily, priceBasis: pair.outcome.series.dailyBasis });
      if (session.status === "resolved") for (const m of session.measurements) candidates.set(measurementKey({ eventId: event.id, symbol, measure: m.measure }), dateFields(m));
      else unavailable.push({ key: `${event.id}/${symbol}/SESSION`, reason: session.reason });
      if (origin.status === "resolved") {
        const hour = resolveIntradayMeasurement({ symbol, releaseAt: event.releaseAt!, intraday: pair.outcome.series.intraday, releaseSessionDay: origin.day });
        if (hour.status === "resolved") for (const m of hour.measurements) candidates.set(measurementKey({ eventId: event.id, symbol, measure: m.measure }), dateFields(m));
        else unavailable.push({ key: `${event.id}/${symbol}/INTRADAY_60M`, reason: hour.reason });
      }
    }
  }
  const changed: { key: string; before: unknown; after: unknown; investigation: string; resolved: boolean; evidence?: unknown }[] = [];
  let unchanged = 0;
  const oldKeys = new Set<string>();
  for (const row of rows) {
    const key = measurementKey(row);
    oldKeys.add(key);
    const prior = dateFields(row), next = candidates.get(key);
    if (!next) {
      const pair = pairs.find(p => p.eventId === row.eventId && p.symbol === row.symbol);
      const retrieval = pair?.outcome.status === "ok" ? pair.outcome.series.intradayAvailability : null;
      const reason = unavailable.find(u => u.key === key)?.reason ?? "unresolved_candidate_absence";
      const intraday = pair?.outcome.status === "ok" ? pair.outcome.series.intraday : [];
      changed.push({ key, before: prior, after: null, investigation: `No v4 candidate; engine reason ${reason}; current intraday retrieval ${retrieval?.status ?? "not_captured"}. This explains current reproducibility only, not historical nonexistence. Preserve the v3 observation; original input archive required for lossless replay.`, evidence: { retrieval, reason, currentIntradayBarCount: intraday.length, firstCurrentIntradayBar: intraday[0]?.barAt.toISOString() ?? null, oldAnchorStillPresent: intraday.some(b => b.barAt.getTime() === row.anchorBarAt.getTime()), currentBarsBeforeRelease: intraday.filter(b => b.barAt.getTime() < (pair?.releaseAt.getTime() ?? 0)).length, fetchedAt: pair?.fetchedAt, ageDaysAtFetch: pair ? (new Date(pair.fetchedAt).getTime() - pair.releaseAt.getTime()) / 86400000 : null }, resolved: false });
    } else if (fingerprint(prior) !== fingerprint(next)) {
      const fields = Object.keys(prior).filter(k => prior[k as keyof typeof prior] !== next[k as keyof typeof next]);
      changed.push({ key, before: prior, after: next, investigation: `Changed fields: ${fields.join(", ")}. ${prior.anchorBarAt === next.anchorBarAt && prior.endpointBarAt === next.endpointBarAt ? "Same source bar identities and session labels; price values differ." : "Source bar selection differs."} Current provider evidence does not identify the historical revision/roll cause. Retain both versions and keep cutover blocked.`, evidence: { changedFields: fields, returnDeltaPercentagePoints: next.pctChange - prior.pctChange, anchorPriceDelta: next.anchorPrice - prior.anchorPrice, endpointPriceDelta: next.endpointPrice - prior.endpointPrice }, resolved: false });
    } else unchanged++;
  }
  const added = [...candidates].filter(([key]) => !oldKeys.has(key)).map(([key, candidate]) => ({ key, candidate, investigation: "Newly measurable with current source inputs; not proof of historical release-time availability." }));
  return { candidateCalculationVersion: COMPUTED_REACTION_CALCULATION_VERSION, observedBefore: rows.length, computedAfter: candidates.size, unchanged, changed: changed.length, removed: changed.filter(c => c.after === null).length, added: added.length, incomplete, unavailableCurrentProvider: unavailable, changedObservations: changed, addedObservations: added, unresolvedChanges: changed.filter(c => !c.resolved).length, applyAuthorized: false, readCutoverAuthorized: false, pointInTimeCertified: false };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 6 || args[0] !== "--snapshot" || !["--inputs-out", "--inputs"].includes(args[2]) || args[4] !== "--report") throw new Error("Usage: --snapshot <file> --inputs-out <file> (live) OR --inputs <file> (offline) --report <file>");
  const original = JSON.parse(await readFile(args[1], "utf8"));
  const events: VerificationEvent[] = original.events.map((e: VerificationEvent) => ({ ...e, releaseAt: e.releaseAt === null ? null : new Date(e.releaseAt) }));
  const rows: VerificationRow[] = original.rows.map((r: VerificationRow) => ({ ...r, anchorBarAt: new Date(r.anchorBarAt), endpointBarAt: new Date(r.endpointBarAt) }));
  let pairs: CapturedPair[];
  if (args[2] === "--inputs") {
    const captured = JSON.parse(await readFile(args[3], "utf8"));
    pairs = captured.pairs.map((p: CapturedPair) => ({ ...p, releaseAt: new Date(p.releaseAt), outcome: p.outcome.status === "failed" ? p.outcome : { ...p.outcome, series: { ...p.outcome.series, daily: p.outcome.series.daily.map(b => ({ ...b, barAt: new Date(b.barAt) })), intraday: p.outcome.series.intraday.map(b => ({ ...b, barAt: new Date(b.barAt) })) } } }));
  } else {
    pairs = [];
    const provider = createYahooMeasurementProvider();
    for (const event of events.filter(e => reactionTimingEligibility(e).eligible)) {
      for (const symbol of ASSET_UNIVERSE) {
        let outcome: SeriesFetchOutcome;
        try { outcome = await provider.fetchSeries({ symbol, releaseAt: event.releaseAt! }); }
        catch { outcome = { status: "failed", reason: "provider_exception" }; }
        if (outcome.status === "failed") outcome = { status: "failed", reason: "provider_fetch_failed" };
        pairs.push({ eventId: event.id, symbol, releaseAt: event.releaseAt!, fetchedAt: new Date().toISOString(), outcome });
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      console.log(`Captured ${pairs.length} event/instrument input series`);
    }
    await writeFile(args[3], JSON.stringify({ provider: provider.id, capturedAt: new Date().toISOString(), evidenceKind: "transformed_adapter_inputs_not_raw_provider_payload", pairs }, null, 2) + "\n");
  }
  const report = { generatedAt: new Date().toISOString(), mode: "dry_run_no_database_client", inputsSha256: fingerprint(pairs), ...planRecomputedImpact(events, rows, pairs) };
  await writeFile(args[5], JSON.stringify(report, null, 2) + "\n");
  console.log(`v4 candidates: ${report.computedAfter}; changed: ${report.changed}; added: ${report.added}; incomplete: ${report.incomplete.length}`);
  if (report.incomplete.length || report.unresolvedChanges) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error("Recomputation impact report incomplete; no database writes were attempted."); process.exitCode = 1; });
