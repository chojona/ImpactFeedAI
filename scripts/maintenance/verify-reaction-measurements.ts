#!/usr/bin/env tsx
/** Strict read-only verification. A missing row or unchecked event fails.
 * --report <path> writes JSON; --version <n> selects the dataset, not semantics.
 * --snapshot-out <path> archives source rows/calendar evidence for offline replay.
 * --snapshot <path> replays captured evidence without credentials/network.
 */
import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createDryRunPrismaClient } from "../lib/readonly-prisma";
import { createYahooMeasurementProvider } from "../ingest/measurement-provider";
import { ASSET_UNIVERSE } from "../ingest/events-seed";
import { CURRENT_REACTION_CALCULATION_VERSION } from "@/services/events/timing";
import { verifyMeasurementDataset, type VerificationEvent, type VerificationRow, type CalendarEvidence } from "@/services/events/measurementCoverage";
export { checkInvariants, type VerifiableMeasurementRow, type InvariantContext, type InvariantViolation } from "@/services/events/measurementVerification";

interface Snapshot {
  capturedAt: string;
  calculationVersion: number;
  databaseReadOnly: boolean;
  events: VerificationEvent[];
  rows: VerificationRow[];
  calendars: Record<string, CalendarEvidence>;
}

async function main() {
  let reportPath: string | undefined, snapshotPath: string | undefined, snapshotOut: string | undefined;
  let version = CURRENT_REACTION_CALCULATION_VERSION;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i], value = args[++i];
    if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
    if (arg === "--report") reportPath = value;
    else if (arg === "--snapshot") snapshotPath = value;
    else if (arg === "--snapshot-out") snapshotOut = value;
    else if (arg === "--version" && /^[1-9]\d*$/.test(value)) version = Number(value);
    else throw new Error(`Unknown or invalid option ${arg}`);
  }
  let snapshot: Snapshot;
  if (snapshotPath) {
    const raw = JSON.parse(await readFile(snapshotPath, "utf8")) as Snapshot;
    snapshot = { ...raw,
      events: raw.events.map(e => ({ ...e, releaseAt: e.releaseAt === null ? null : new Date(e.releaseAt) })),
      rows: raw.rows.map(r => ({ ...r, anchorBarAt: new Date(r.anchorBarAt), endpointBarAt: new Date(r.endpointBarAt) })),
    };
    if (version !== snapshot.calculationVersion) throw new Error("Snapshot calculation version differs; specify matching --version");
  } else {
    const prisma = createDryRunPrismaClient();
    try {
      const readOnly = await prisma.$queryRawUnsafe<{ default_transaction_read_only: string }[]>("SHOW default_transaction_read_only");
      if (readOnly[0]?.default_transaction_read_only !== "on") throw new Error("Database read-only guard not active");
      // Both source tables are captured at one repeatable-read snapshot. Fetch
      // providers afterwards so a network timeout does not pin a DB transaction.
      const data = await prisma.$transaction(async tx => {
        await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
        const events = await tx.event.findMany({ select: { id: true, releaseAt: true, timingStatus: true, timingSource: true }, orderBy: { id: "asc" } });
        const stored = await tx.reactionMeasurement.findMany({ where: { calculationVersion: version }, orderBy: [{ eventId: "asc" }, { symbol: "asc" }, { measure: "asc" }] });
        return { events, rows: stored.map(r => ({ ...r, anchorSessionDay: r.anchorSessionDay.toISOString().slice(0, 10), endpointSessionDay: r.endpointSessionDay.toISOString().slice(0, 10), releaseSessionDay: r.releaseSessionDay.toISOString().slice(0, 10) })) };
      }, { isolationLevel: "RepeatableRead" });
      snapshot = { capturedAt: new Date().toISOString(), calculationVersion: version, databaseReadOnly: true, ...data, calendars: {} };
    } finally { await prisma.$disconnect(); }
  }
  const provider = createYahooMeasurementProvider();
  const report = await verifyMeasurementDataset({ ...snapshot, symbols: ASSET_UNIVERSE,
    fetchCalendar: async event => {
      if (snapshot.calendars[event.id]) return snapshot.calendars[event.id];
      if (snapshotPath) return { status: "failed", reason: "snapshot_missing_calendar" };
      let result;
      try { result = await provider.fetchSeries({ symbol: "SPY", releaseAt: event.releaseAt! }); }
      catch { return snapshot.calendars[event.id] = { status: "failed", reason: "reference_provider_exception" }; }
      // Provider exceptions must also be archived, never silently skipped.
      return snapshot.calendars[event.id] = result.status === "failed"
        ? { status: "failed", reason: "reference_provider_failed" }
        : { status: "ok", days: result.series.daily.map(b => b.sessionDay) };
    },
  });
  if (snapshotOut) await writeFile(snapshotOut, JSON.stringify(snapshot, null, 2) + "\n");
  const output = { snapshotSha256: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"), generatedAt: new Date().toISOString(), capturedAt: snapshot.capturedAt, calculationVersion: snapshot.calculationVersion, databaseReadOnly: snapshot.databaseReadOnly, mode: snapshotPath ? "offline_evidence_replay" : "live_read_only", ...report };
  if (reportPath) await writeFile(reportPath, JSON.stringify(output, null, 2) + "\n");
  console.log(JSON.stringify(output, null, 2));
  if (!report.passed) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(async (error: unknown) => {
  // Do not print a Prisma/provider message that might contain a credential URL.
  const failure = { passed: false, status: "incomplete", generatedAt: new Date().toISOString(), errorType: error instanceof Error ? error.name : "UnknownError", diagnostic: "Verification did not complete. Check database/provider access, CLI options and report paths. No dataset acceptance is recorded." };
  console.error(JSON.stringify(failure));
  const index = process.argv.indexOf("--report");
  if (index >= 0 && process.argv[index + 1]) await writeFile(process.argv[index + 1], JSON.stringify(failure, null, 2) + "\n").catch(() => {});
  process.exitCode = 1;
});
