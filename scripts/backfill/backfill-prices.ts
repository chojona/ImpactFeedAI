#!/usr/bin/env tsx
/**
 * Resumable price backfill.
 *
 * Fills in missing `AssetReaction` rows for events that already exist. This is
 * the escape hatch the pipeline was missing: both ingestion scripts skip an
 * event that is already in the database *before* fetching prices, so an event
 * ingested with `--no-prices` (or one whose Yahoo fetch failed that day) could
 * never acquire reactions afterwards.
 *
 *   npm run backfill:prices -- --dry-run --limit 5   # inspect, write nothing
 *   npm run backfill:prices -- --limit 20            # backfill 20 events
 *   npm run backfill:prices -- --only-empty          # only events with 0 rows
 *
 * Properties:
 *   idempotent  — a second run finds nothing to do; existing rows are never
 *                 rewritten. Inserts use skipDuplicates against the
 *                 (event_id, asset_symbol) unique constraint.
 *   resumable   — each event is committed on its own, oldest first. Ctrl-C at
 *                 any point leaves a consistent database; re-run to continue.
 *   additive    — never creates or deletes Event rows, never deletes or
 *                 updates an existing AssetReaction.
 */
import "dotenv/config";

import { ASSET_UNIVERSE } from "../ingest/events-seed";
import { buildAssetReaction } from "../ingest/compute-reactions";
import { fetchPriceSnapshot, sleep } from "../ingest/fetch-prices";
import { createScriptPrismaClient } from "../lib/prisma";
import { createDryRunPrismaClient } from "../lib/readonly-prisma";

const PER_SYMBOL_DELAY_MS = 500;
const PER_EVENT_DELAY_MS = 1000;

interface Flags {
  dryRun: boolean;
  limit: number | null;
  onlyEmpty: boolean;
  since: string | null;
  eventType: string | null;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    dryRun: false,
    limit: null,
    onlyEmpty: false,
    since: null,
    eventType: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--only-empty") flags.onlyEmpty = true;
    else if (arg === "--limit") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n <= 0) {
        console.error("--limit requires a positive integer");
        process.exit(2);
      }
      flags.limit = n;
    } else if (arg === "--since") {
      const v = argv[++i];
      if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        console.error("--since must be ISO YYYY-MM-DD");
        process.exit(2);
      }
      flags.since = v;
    } else if (arg === "--event-type") {
      const v = argv[++i];
      if (!v) {
        console.error("--event-type requires a value");
        process.exit(2);
      }
      flags.eventType = v.toUpperCase();
    } else if (arg === "-h" || arg === "--help") {
      console.log(`Usage: tsx scripts/backfill/backfill-prices.ts [options]

Options:
  --dry-run              Report what would be inserted; write nothing.
  --limit <n>            Process at most n events.
  --only-empty           Only events with zero AssetReaction rows
                         (default: also top up events missing some symbols).
  --since <YYYY-MM-DD>   Only events on or after this date.
  --event-type <TYPE>    Restrict to one EventType.
  -h, --help             Show this help.`);
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return flags;
}

interface Stats {
  scanned: number;
  needing: number;
  rowsInserted: number;
  rowsStillMissing: number;
  eventsCompleted: number;
  eventsFailed: number;
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const prisma = flags.dryRun
    ? createDryRunPrismaClient()
    : createScriptPrismaClient();

  console.log(
    `backfill-prices starting${flags.dryRun ? " (dry-run — no writes)" : ""}` +
      `${flags.onlyEmpty ? " [only-empty]" : ""}` +
      `${flags.since ? ` since=${flags.since}` : ""}` +
      `${flags.eventType ? ` type=${flags.eventType}` : ""}`,
  );
  console.log(`Target universe: ${ASSET_UNIVERSE.length} symbols\n`);

  const stats: Stats = {
    scanned: 0,
    needing: 0,
    rowsInserted: 0,
    rowsStillMissing: 0,
    eventsCompleted: 0,
    eventsFailed: 0,
  };

  try {
    // Oldest first so an interrupted run resumes predictably.
    const events = await prisma.event.findMany({
      where: {
        ...(flags.since ? { occurredAt: { gte: new Date(flags.since) } } : {}),
        ...(flags.eventType
          ? { eventType: flags.eventType as never }
          : {}),
        ...(flags.onlyEmpty ? { assetReactions: { none: {} } } : {}),
      },
      select: {
        id: true,
        headline: true,
        occurredAt: true,
        assetReactions: { select: { assetSymbol: true } },
      },
      orderBy: { occurredAt: "asc" },
    });

    stats.scanned = events.length;

    const work = events
      .map((e) => {
        const have = new Set(e.assetReactions.map((a) => a.assetSymbol));
        const missing = ASSET_UNIVERSE.filter((s) => !have.has(s));
        return { event: e, missing };
      })
      .filter((w) => w.missing.length > 0);

    stats.needing = work.length;
    const queue = flags.limit === null ? work : work.slice(0, flags.limit);

    console.log(
      `${stats.scanned} event(s) scanned — ${stats.needing} need prices` +
        `${flags.limit !== null ? `, processing ${queue.length}` : ""}\n`,
    );
    if (queue.length === 0) {
      console.log("Nothing to backfill. ✓");
      return;
    }

    for (const { event, missing } of queue) {
      const label = event.headline.slice(0, 62);
      console.log(`→ ${label} — missing ${missing.length}: ${missing.join(", ")}`);

      const rows: ReturnType<typeof buildAssetReaction>[] = [];
      for (const symbol of missing) {
        const snapshot = await fetchPriceSnapshot(symbol, event.occurredAt);
        if (snapshot === null) {
          console.warn(`  ⚠ ${symbol}: still no anchor price — leaving absent`);
          stats.rowsStillMissing += 1;
        } else {
          rows.push(buildAssetReaction(symbol, snapshot));
        }
        await sleep(PER_SYMBOL_DELAY_MS);
      }

      if (rows.length === 0) {
        console.log(`  · nothing recoverable for this event`);
        await sleep(PER_EVENT_DELAY_MS);
        continue;
      }

      if (flags.dryRun) {
        console.log(`  [dry-run] would insert ${rows.length} reaction row(s)`);
        stats.rowsInserted += rows.length;
        stats.eventsCompleted += 1;
        await sleep(PER_EVENT_DELAY_MS);
        continue;
      }

      try {
        // skipDuplicates makes this safe against a concurrent writer and
        // against re-running: the (event_id, asset_symbol) unique constraint
        // is the backstop, and existing rows are left untouched.
        const result = await prisma.assetReaction.createMany({
          data: rows.map((r) => ({
            eventId: event.id,
            assetSymbol: r.assetSymbol,
            priceAtEvent: r.priceAtEvent,
            price1h: r.price1h,
            price1d: r.price1d,
            price1w: r.price1w,
            pctChange1h: r.pctChange1h,
            pctChange1d: r.pctChange1d,
            pctChange1w: r.pctChange1w,
          })),
          skipDuplicates: true,
        });
        stats.rowsInserted += result.count;
        stats.eventsCompleted += 1;
        console.log(`  ✓ inserted ${result.count} row(s)`);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.error(`  ✗ insert failed: ${detail}`);
        stats.eventsFailed += 1;
      }

      await sleep(PER_EVENT_DELAY_MS);
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log("");
  console.log(
    `Done. events_scanned=${stats.scanned} needed=${stats.needing} ` +
      `completed=${stats.eventsCompleted} failed=${stats.eventsFailed} ` +
      `rows_inserted=${stats.rowsInserted} still_missing=${stats.rowsStillMissing}`,
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
