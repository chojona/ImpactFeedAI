#!/usr/bin/env tsx
/**
 * Historical event ingestion pipeline.
 *
 *   npx tsx scripts/ingest/ingest.ts
 *   npx tsx scripts/ingest/ingest.ts --dry-run
 *   npx tsx scripts/ingest/ingest.ts --event-type CPI
 *
 * Reads SEED_EVENTS, fetches Yahoo prices for ASSET_UNIVERSE, fetches FRED
 * actuals where applicable, and writes Event / AssetReaction / DataRelease
 * rows via Prisma. Idempotent: re-runs skip events already in the DB.
 *
 * Behaviour:
 *   - Best-effort. A failed symbol → null fields + warning, never a crash.
 *   - Rate-limited: 500ms between symbols, 1000ms between events.
 *   - DataRelease rows are inserted when either FRED returns data OR the seed
 *     event carries a manual expectedValue.
 */
// Load DATABASE_URL / FRED_API_KEY from .env — tsx does not auto-load env
// files the way Next.js does at runtime. Matches the pattern in prisma.config.ts.
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../src/generated/prisma/client";
import {
  ASSET_UNIVERSE,
  SEED_EVENTS,
  type SeedEvent,
  type SeedEventType,
} from "./events-seed";
import { fetchPriceSnapshot, sleep } from "./fetch-prices";
import { fetchMacroRelease } from "./fetch-macro";
import { buildAssetReaction } from "./compute-reactions";

const PER_SYMBOL_DELAY_MS = 500;
const PER_EVENT_DELAY_MS = 1000;

interface CliFlags {
  dryRun: boolean;
  eventType: SeedEventType | null;
  limit: number | null;
}

const KNOWN_EVENT_TYPES: ReadonlySet<SeedEventType> = new Set([
  "TARIFF",
  "FED_DECISION",
  "CPI",
  "PPI",
  "NFP",
  "GEOPOLITICAL",
  "EARNINGS_SURPRISE",
  "MACRO_DATA",
]);

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = { dryRun: false, eventType: null, limit: null };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      flags.dryRun = true;
    } else if (arg === "--event-type") {
      const v = argv[++i]?.toUpperCase() as SeedEventType | undefined;
      if (!v || !KNOWN_EVENT_TYPES.has(v)) {
        console.error(
          `--event-type requires one of: ${[...KNOWN_EVENT_TYPES].join(", ")}`,
        );
        process.exit(2);
      }
      flags.eventType = v;
    } else if (arg === "--limit") {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n <= 0) {
        console.error("--limit requires a positive integer");
        process.exit(2);
      }
      flags.limit = Math.floor(n);
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      printHelp();
      process.exit(2);
    }
  }
  return flags;
}

function printHelp(): void {
  console.log(`Usage: tsx scripts/ingest/ingest.ts [options]

Options:
  --dry-run               Fetch + print, write nothing to the DB.
  --event-type <type>     Limit to one category. One of:
                          ${[...KNOWN_EVENT_TYPES].join(", ")}
  --limit <n>             Process at most n events (after filters). Useful for smoke tests.
  -h, --help              Show this help.`);
}

function buildPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Aborting.");
    process.exit(1);
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
}

interface IngestStats {
  processed: number;
  skipped: number;
  failed: number;
  assetRowsWritten: number;
  macroRowsWritten: number;
}

async function ingestEvent(
  prisma: PrismaClient | null,
  seed: SeedEvent,
  dryRun: boolean,
  stats: IngestStats,
): Promise<void> {
  const occurredAt = new Date(seed.occurredAt);
  if (Number.isNaN(occurredAt.getTime())) {
    console.error(`✗ Skipping: invalid occurredAt "${seed.occurredAt}"`);
    stats.failed += 1;
    return;
  }

  // Idempotency check (skipped only when there is no DB connection at all)
  if (prisma) {
    const existing = await prisma.event.findUnique({
      where: {
        event_natural_key: {
          headline: seed.headline,
          occurredAt,
        },
      },
      select: { id: true },
    });
    if (existing) {
      console.log(`↺ Skip (exists): ${seed.headline}`);
      stats.skipped += 1;
      return;
    }
  }

  console.log(`→ Ingesting: ${seed.headline}`);

  // ── Prices ──────────────────────────────────────────────────────────────
  const assetRows: ReturnType<typeof buildAssetReaction>[] = [];
  for (const symbol of ASSET_UNIVERSE) {
    const snapshot = await fetchPriceSnapshot(symbol, occurredAt);
    if (snapshot === null) {
      console.warn(`  ⚠ ${symbol}: no anchor price — skipping asset`);
    } else {
      assetRows.push(buildAssetReaction(symbol, snapshot));
    }
    await sleep(PER_SYMBOL_DELAY_MS);
  }

  // ── Macro (FRED) ────────────────────────────────────────────────────────
  const macro = await fetchMacroRelease({
    eventType: seed.eventType,
    occurredAt,
    expectedValue: seed.expectedValue ?? null,
    metricNameOverride: seed.metricName ?? null,
  });

  if (dryRun) {
    console.log(
      `  [dry-run] would insert event + ${assetRows.length} asset reactions${
        macro ? " + 1 data release" : ""
      }`,
    );
    stats.processed += 1;
    stats.assetRowsWritten += assetRows.length;
    if (macro) stats.macroRowsWritten += 1;
    return;
  }

  // ── Persist (single transaction) ────────────────────────────────────────
  // Unreachable when dryRun is true (early return above). When dryRun is
  // false, main() always constructs a real client, so prisma is non-null.
  if (!prisma) {
    console.error(
      `✗ ${seed.headline}: no DB client available — re-run without --dry-run with DATABASE_URL set`,
    );
    stats.failed += 1;
    return;
  }
  try {
    await prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          headline: seed.headline,
          eventType: seed.eventType,
          occurredAt,
          sourceUrl: seed.sourceUrl ?? null,
        },
        select: { id: true },
      });

      if (assetRows.length > 0) {
        await tx.assetReaction.createMany({
          data: assetRows.map((row) => ({
            eventId: event.id,
            assetSymbol: row.assetSymbol,
            priceAtEvent: row.priceAtEvent,
            price1h: row.price1h,
            price1d: row.price1d,
            price1w: row.price1w,
            pctChange1h: row.pctChange1h,
            pctChange1d: row.pctChange1d,
            pctChange1w: row.pctChange1w,
          })),
        });
      }

      if (macro) {
        await tx.dataRelease.create({
          data: {
            eventId: event.id,
            metricName: macro.metricName,
            actualValue: macro.actualValue,
            expectedValue: macro.expectedValue,
            priorValue: macro.priorValue,
            surpriseMagnitude: macro.surpriseMagnitude,
          },
        });
      }
    });

    console.log(
      `✓ Ingested: ${seed.headline} (${assetRows.length} assets${macro ? ", +macro" : ""})`,
    );
    stats.processed += 1;
    stats.assetRowsWritten += assetRows.length;
    if (macro) stats.macroRowsWritten += 1;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`✗ Failed to persist ${seed.headline}: ${detail}`);
    stats.failed += 1;
  }
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));

  let events = SEED_EVENTS;
  if (flags.eventType) {
    events = events.filter((e) => e.eventType === flags.eventType);
  }
  if (flags.limit !== null) {
    events = events.slice(0, flags.limit);
  }

  console.log(
    `Pipeline starting${flags.dryRun ? " (dry-run)" : ""}: ${events.length} event(s) queued`,
  );
  if (flags.eventType) console.log(`  filter: eventType=${flags.eventType}`);

  // Dry-run skips the DB entirely — works even without DATABASE_URL. The
  // tradeoff: dry-run can't tell you which events would be skipped as
  // duplicates. The summary makes that explicit.
  const prisma = flags.dryRun ? null : buildPrismaClient();
  const stats: IngestStats = {
    processed: 0,
    skipped: 0,
    failed: 0,
    assetRowsWritten: 0,
    macroRowsWritten: 0,
  };

  try {
    for (const seed of events) {
      await ingestEvent(prisma, seed, flags.dryRun, stats);
      await sleep(PER_EVENT_DELAY_MS);
    }
  } finally {
    if (prisma) await prisma.$disconnect();
  }

  console.log("");
  console.log(
    `Done. processed=${stats.processed} skipped=${stats.skipped} failed=${stats.failed} ` +
      `asset_rows=${stats.assetRowsWritten} macro_rows=${stats.macroRowsWritten}`,
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});