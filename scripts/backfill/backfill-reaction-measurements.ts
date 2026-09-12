#!/usr/bin/env tsx
/**
 * Backfill v3 reaction measurements (`reaction_measurements`) around
 * timing-eligible events.
 *
 * Default mode is dry-run. Applying is deliberately cumbersome:
 *
 *   npm run backfill:reaction-measurements:dry-run
 *   npm run backfill:reaction-measurements:dry-run -- --event-id <uuid> --limit 3
 *   REACTION_MEASUREMENT_BACKFILL_CONFIRM=WRITE_MEASUREMENTS \
 *     npm run backfill:reaction-measurements -- --apply
 *
 * Properties:
 *   idempotent  — inserts use skipDuplicates against the
 *                 (event_id, symbol, measure, calculation_version) unique
 *                 index, so a second run inserts nothing and reports every
 *                 row as already present.
 *   resumable   — each event·symbol pair is written in one createMany call,
 *                 oldest event first. Ctrl-C leaves a consistent database;
 *                 re-run to continue.
 *   additive    — never updates or deletes a ReactionMeasurement row, and
 *                 never touches `asset_reactions` (the frozen v2 archive) or
 *                 any other table.
 *   fail-closed — an unreachable reference calendar, an undeclared
 *                 sessionBasis, a refused anchor or an unusable provider
 *                 price produces zero rows and a counted reason. It never
 *                 falls back to a per-instrument calendar and never
 *                 fabricates a bar.
 *
 * The canonical session calendar is built ONCE per event from SPY's own
 * daily series and reused for every instrument in that event — see spec
 * §4.1. If the reference fetch fails, the WHOLE event is skipped; there is
 * no per-instrument fallback calendar.
 */
import "dotenv/config";

import { createScriptPrismaClient } from "../lib/prisma";
import { createDryRunPrismaClient } from "../lib/readonly-prisma";
import type { PrismaClient } from "../../src/generated/prisma/client";
import {
  createYahooMeasurementProvider,
  type MeasurementSeriesProvider,
} from "../ingest/measurement-provider";
import { sleep } from "../ingest/fetch-prices";
import { ASSET_UNIVERSE } from "../ingest/events-seed";
import {
  resolveIntradayMeasurement,
  resolveSessionMeasurements,
  type MeasurementRefusal,
  type ResolvedMeasurement,
} from "@/services/events/reactionMeasurement";
import { buildSessionCalendar, resolveReleaseSession } from "@/services/market/sessionCalendar";
import { REACTION_ELIGIBLE_TIMING_STATUSES } from "@/services/events/timing";
import { utcDateOnly } from "@/services/macro/time";
import { CURRENT_REACTION_CALCULATION_VERSION } from "@/services/events/timing";

const APPLY_CONFIRMATION = "WRITE_MEASUREMENTS";
const CONFIRMATION_ENV = "REACTION_MEASUREMENT_BACKFILL_CONFIRM";

const PER_SYMBOL_DELAY_MS = 500;
const PER_EVENT_DELAY_MS = 1_000;

interface Flags {
  apply: boolean;
  eventIds: string[];
  limit: number | null;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { apply: false, eventIds: [], limit: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") flags.apply = false;
    else if (arg === "--apply") flags.apply = true;
    else if (arg === "--event-id") {
      const value = argv[++i];
      if (!value) throw new Error("--event-id requires a value");
      flags.eventIds.push(value);
    } else if (arg === "--limit") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error("--limit requires a positive integer");
      }
      flags.limit = n;
    } else if (arg === "-h" || arg === "--help") {
      console.log(`Usage: tsx scripts/backfill/backfill-reaction-measurements.ts [options]

Dry-run by default. Applying requires ${CONFIRMATION_ENV}=${APPLY_CONFIRMATION}.

Options:
  --dry-run            Report what would be written; write nothing. (default)
  --apply              Persist measurements. Requires the confirmation variable
                       and DIRECT_URL — the pooled fallback is refused.
  --event-id <uuid>    Restrict to one event; may be repeated.
  --limit <n>          Process at most n events.
  -h, --help           Show this help.`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return flags;
}

/**
 * Always requires DIRECT_URL — even for a dry-run, so a dry-run predicts the
 * real run against the same connection endpoint rather than silently
 * evaluating against a different one. Exits 2 rather than throwing, matching
 * `backfill-candles.ts`'s convention for a refused gate.
 */
function requireDirectUrl(apply: boolean): void {
  if (!process.env.DIRECT_URL) {
    console.error(
      "DIRECT_URL is required. This backfill refuses the pooled DATABASE_URL fallback.",
    );
    process.exit(2);
  }
  if (apply && process.env[CONFIRMATION_ENV] !== APPLY_CONFIRMATION) {
    console.error(
      `Refusing to write. --apply requires ${CONFIRMATION_ENV}=${APPLY_CONFIRMATION} ` +
        `in the environment.`,
    );
    process.exit(2);
  }
}

interface Stats {
  eventsConsidered: number;
  eventsSkippedNoReferenceCalendar: number;
  pairsAttempted: number;
  pairsProviderError: number;
  refusalCounts: Partial<Record<MeasurementRefusal, number>>;
  rowsByMeasure: Record<string, number>;
  rowsInserted: number;
  rowsAlreadyPresent: number;
}

const emptyStats = (): Stats => ({
  eventsConsidered: 0,
  eventsSkippedNoReferenceCalendar: 0,
  pairsAttempted: 0,
  pairsProviderError: 0,
  refusalCounts: {},
  rowsByMeasure: {},
  rowsInserted: 0,
  rowsAlreadyPresent: 0,
});

function countRefusal(stats: Stats, reason: MeasurementRefusal): void {
  stats.refusalCounts[reason] = (stats.refusalCounts[reason] ?? 0) + 1;
}

interface WritableRow {
  eventId: string;
  symbol: string;
  measure: ResolvedMeasurement["measure"];
  anchorKind: ResolvedMeasurement["anchorKind"];
  anchorPrice: number;
  anchorBarAt: Date;
  anchorSessionDay: Date;
  endpointPrice: number;
  endpointBarAt: Date;
  endpointSessionDay: Date;
  releaseSessionDay: Date;
  pctChange: number;
  priceBasis: ResolvedMeasurement["priceBasis"];
  sessionBasis: ResolvedMeasurement["sessionBasis"];
  provider: string;
  calculationVersion: number;
  fetchedAt: Date;
}

function toRow(
  eventId: string,
  symbol: string,
  m: ResolvedMeasurement,
  providerId: string,
  fetchedAt: Date,
): WritableRow {
  return {
    eventId,
    symbol,
    measure: m.measure,
    anchorKind: m.anchorKind,
    anchorPrice: m.anchorPrice,
    anchorBarAt: m.anchorBarAt,
    anchorSessionDay: utcDateOnly(m.anchorSessionDay),
    endpointPrice: m.endpointPrice,
    endpointBarAt: m.endpointBarAt,
    endpointSessionDay: utcDateOnly(m.endpointSessionDay),
    releaseSessionDay: utcDateOnly(m.releaseSessionDay),
    pctChange: m.pctChange,
    priceBasis: m.priceBasis,
    sessionBasis: m.sessionBasis,
    provider: providerId,
    calculationVersion: CURRENT_REACTION_CALCULATION_VERSION,
    fetchedAt,
  };
}

async function processSymbol(
  prisma: PrismaClient,
  provider: MeasurementSeriesProvider,
  eventId: string,
  symbol: string,
  releaseAt: Date,
  calendarDays: readonly string[],
  apply: boolean,
  stats: Stats,
  cachedSpySeries: Awaited<ReturnType<MeasurementSeriesProvider["fetchSeries"]>> | null,
): Promise<void> {
  stats.pairsAttempted += 1;

  const seriesOutcome =
    symbol === "SPY" && cachedSpySeries !== null
      ? cachedSpySeries
      : await provider.fetchSeries({ symbol, releaseAt });

  if (seriesOutcome.status === "failed") {
    stats.pairsProviderError += 1;
    console.log(`    ${symbol.padEnd(10)} provider error — ${seriesOutcome.reason}`);
    return;
  }

  const calendar = buildSessionCalendar(calendarDays);
  const release = resolveReleaseSession(calendar, releaseAt);

  const rows: WritableRow[] = [];
  const fetchedAt = new Date();

  const sessionOutcome = resolveSessionMeasurements({
    symbol,
    releaseAt,
    calendar,
    daily: seriesOutcome.series.daily,
    priceBasis: seriesOutcome.series.dailyBasis,
  });
  if (sessionOutcome.status === "refused") {
    countRefusal(stats, sessionOutcome.reason);
  } else {
    for (const m of sessionOutcome.measurements) {
      rows.push(toRow(eventId, symbol, m, provider.id, fetchedAt));
      stats.rowsByMeasure[m.measure] = (stats.rowsByMeasure[m.measure] ?? 0) + 1;
    }
  }

  // Intraday needs the resolved release session day. If the session pass
  // could not resolve one, there is nothing to anchor an intraday
  // measurement's releaseSessionDay to either — skip it too rather than
  // guessing.
  if (release.status === "resolved") {
    const intradayOutcome = resolveIntradayMeasurement({
      symbol,
      releaseAt,
      intraday: seriesOutcome.series.intraday,
      releaseSessionDay: release.day,
    });
    if (intradayOutcome.status === "refused") {
      countRefusal(stats, intradayOutcome.reason);
    } else {
      for (const m of intradayOutcome.measurements) {
        rows.push(toRow(eventId, symbol, m, provider.id, fetchedAt));
        stats.rowsByMeasure[m.measure] = (stats.rowsByMeasure[m.measure] ?? 0) + 1;
      }
    }
  }

  if (rows.length === 0) {
    console.log(`    ${symbol.padEnd(10)} no measurements`);
    return;
  }

  if (!apply) {
    const existing = await prisma.reactionMeasurement.count({
      where: {
        eventId,
        symbol,
        calculationVersion: CURRENT_REACTION_CALCULATION_VERSION,
        measure: { in: rows.map((r) => r.measure) },
      },
    });
    stats.rowsAlreadyPresent += existing;
    stats.rowsInserted += rows.length - existing;
    console.log(
      `    ${symbol.padEnd(10)} would insert ${rows.length - existing} · already present ${existing} · [${rows.map((r) => r.measure).join(", ")}]`,
    );
    return;
  }

  const result = await prisma.reactionMeasurement.createMany({
    data: rows,
    skipDuplicates: true,
  });
  stats.rowsInserted += result.count;
  stats.rowsAlreadyPresent += rows.length - result.count;
  console.log(
    `    ${symbol.padEnd(10)} inserted ${result.count} · already present ${rows.length - result.count} · [${rows.map((r) => r.measure).join(", ")}]`,
  );
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  requireDirectUrl(flags.apply);

  const prisma = flags.apply
    ? createScriptPrismaClient()
    : createDryRunPrismaClient();
  const provider = createYahooMeasurementProvider();
  const stats = emptyStats();

  console.log(
    `backfill-reaction-measurements${flags.apply ? " (APPLY — writing)" : " (dry-run — no writes)"}`,
  );
  console.log(`  provider  ${provider.id}`);
  console.log(`  version   ${CURRENT_REACTION_CALCULATION_VERSION}\n`);

  try {
    const events = await prisma.event.findMany({
      where: {
        timingStatus: { in: [...REACTION_ELIGIBLE_TIMING_STATUSES] },
        releaseAt: { not: null },
        timingSource: { not: null },
        ...(flags.eventIds.length > 0 ? { id: { in: flags.eventIds } } : {}),
      },
      orderBy: [{ releaseAt: "asc" }, { id: "asc" }],
      select: { id: true, headline: true, eventType: true, releaseAt: true },
    });

    const selected = flags.limit === null ? events : events.slice(0, flags.limit);
    console.log(`Timing-eligible events: ${events.length}   selected: ${selected.length}\n`);

    for (const event of selected) {
      if (event.releaseAt === null) continue;
      stats.eventsConsidered += 1;

      const spySeries = await provider.fetchSeries({
        symbol: "SPY",
        releaseAt: event.releaseAt,
      });
      if (spySeries.status === "failed") {
        stats.eventsSkippedNoReferenceCalendar += 1;
        console.log(
          `  ${event.releaseAt.toISOString().slice(0, 16)}  ${event.headline.slice(0, 44)}\n` +
            `    reference calendar unavailable — ${spySeries.reason}`,
        );
        await sleep(PER_EVENT_DELAY_MS);
        continue;
      }

      const calendarDays = spySeries.series.daily.map((bar) => bar.sessionDay);

      console.log(
        `  ${event.releaseAt.toISOString().slice(0, 16)}  ${event.eventType.padEnd(13)} ${event.headline.slice(0, 44)}`,
      );

      for (const symbol of ASSET_UNIVERSE) {
        await processSymbol(
          prisma,
          provider,
          event.id,
          symbol,
          event.releaseAt,
          calendarDays,
          flags.apply,
          stats,
          symbol === "SPY" ? spySeries : null,
        );
        await sleep(PER_SYMBOL_DELAY_MS);
      }
      await sleep(PER_EVENT_DELAY_MS);
    }

    console.log(`\n${flags.apply ? "Applied" : "Dry run"} summary`);
    console.log(`  events considered              ${stats.eventsConsidered}`);
    console.log(`  events — no reference calendar ${stats.eventsSkippedNoReferenceCalendar}`);
    console.log(`  event·symbol attempted         ${stats.pairsAttempted}`);
    console.log(`  provider errors                ${stats.pairsProviderError}`);
    console.log(`  refusals by reason:`);
    for (const [reason, count] of Object.entries(stats.refusalCounts)) {
      console.log(`    ${reason.padEnd(24)} ${count}`);
    }
    console.log(`  rows by measure:`);
    for (const [measure, count] of Object.entries(stats.rowsByMeasure)) {
      console.log(`    ${measure.padEnd(24)} ${count}`);
    }
    console.log(
      `  ${flags.apply ? "inserted                      " : "would insert                  "} ${stats.rowsInserted}`,
    );
    console.log(`  already present                ${stats.rowsAlreadyPresent}`);

    if (!flags.apply) {
      console.log(
        `\nNothing was written. To apply:\n  ${CONFIRMATION_ENV}=${APPLY_CONFIRMATION} npm run backfill:reaction-measurements -- --apply`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
