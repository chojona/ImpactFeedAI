#!/usr/bin/env tsx
/**
 * Automated event ingestion. Pulls structured macro observations from FRED,
 * BLS, and FRED's effective-rate history and writes them into the same Event /
 * AssetReaction / DataRelease tables that the manual seed pipeline uses.
 *
 *   npm run auto-ingest                        # all sources, with prices
 *   npm run auto-ingest -- --no-prices          # event metadata only (~15 min)
 *   npm run auto-ingest -- --source fred        # FRED only
 *   npm run auto-ingest -- --since 2020-01-01   # only post-2020
 *   npm run auto-ingest -- --dry-run            # print + count, no DB writes
 *
 * Dedup: every initial macro release has a source-independent key built from
 * canonical metric + reference period + release stage. A legacy day+metric
 * lookup remains only to recognize rows written before event_key existed.
 *
 * FRED/BLS observations and inferred DFEDTARU changes do not prove an exact
 * publication instant. They are therefore stored, but the central timing gate
 * suppresses price calls until a release-calendar provider promotes an event
 * with sourced VERIFIED or SCHEDULED timing.
 */
import "dotenv/config";

import type { PrismaClient } from "../../src/generated/prisma/client";
import { createScriptPrismaClient } from "../lib/prisma";
import { createDryRunPrismaClient } from "../lib/readonly-prisma";
import { yieldFredEvents } from "./sources-fred";
import { yieldBlsEvents } from "./sources-bls";
import { yieldFomcEvents } from "./sources-fomc";
import { fetchPriceSnapshot, sleep } from "./fetch-prices";
import { buildAssetReaction } from "./compute-reactions";
import type { CandidateEvent, SourceTag } from "./auto-ingest-types";
import { ASSET_UNIVERSE } from "./events-seed";
import { isReactionTimingEligible } from "@/services/events/timing";

const PER_SYMBOL_DELAY_MS = 500;
const PER_EVENT_DELAY_MS = 2000;
const YAHOO_BACKOFF_THRESHOLD = 3;
const YAHOO_BACKOFF_MS = 30_000;
const DEFAULT_SINCE = "2000-01-01";

type SourceFlag = "fred" | "bls" | "fomc" | null;

interface Flags {
  source: SourceFlag;
  dryRun: boolean;
  since: string;
  noPrices: boolean;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    source: null,
    dryRun: false,
    since: DEFAULT_SINCE,
    noPrices: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--no-prices") flags.noPrices = true;
    else if (arg === "--source") {
      const v = argv[++i]?.toLowerCase();
      if (v !== "fred" && v !== "bls" && v !== "fomc") {
        console.error("--source must be one of: fred, bls, fomc");
        process.exit(2);
      }
      flags.source = v;
    } else if (arg === "--since") {
      const v = argv[++i];
      if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        console.error("--since must be ISO YYYY-MM-DD");
        process.exit(2);
      }
      flags.since = v;
    } else if (arg === "-h" || arg === "--help") {
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
  console.log(`Usage: tsx scripts/ingest/auto-ingest.ts [options]

Options:
  --source <fred|bls|fomc>   Restrict to one source (default: all three).
  --dry-run                  Fetch + count, no DB writes.
  --since <YYYY-MM-DD>       Earliest observation date (default ${DEFAULT_SINCE}).
  --no-prices                Skip yfinance price fetching. ~15 min vs 4-5 hr.
  -h, --help                 Show this help.

Recommended first run:
  npm run auto-ingest -- --no-prices
  Add sourced release timing through a calendar provider before backfilling.`);
}

interface IngestStats {
  fetched: number;
  inserted: number;
  duplicates: number;
  yahooSkipped: number;
  timingSuppressed: number;
  bySource: Record<SourceTag, number>;
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setUTCHours(0, 0, 0, 0);
  return c;
}
function endOfDay(d: Date): Date {
  const c = new Date(d);
  c.setUTCHours(23, 59, 59, 999);
  return c;
}

/**
 * Identity of an economic release for in-run deduplication: same event type,
 * same UTC day, same canonical metric — the same key the database query below
 * matches on.
 */
const releaseKey = (cand: CandidateEvent): string => cand.eventKey;

/**
 * Pull events from each requested source. Generators run sequentially —
 * keeps memory bounded and serialises the FRED rate limit naturally.
 */
async function* candidates(flags: Flags): AsyncGenerator<CandidateEvent> {
  const log = (m: string) => console.log(m);
  const fredKey = process.env.FRED_API_KEY;
  if (!fredKey && (flags.source === null || flags.source === "fred" || flags.source === "fomc")) {
    console.warn(
      "⚠ FRED_API_KEY is not set — FRED and FOMC sources will be skipped.",
    );
  }

  if ((flags.source === null || flags.source === "fred") && fredKey) {
    yield* yieldFredEvents({ apiKey: fredKey, since: flags.since, log });
  }
  if (flags.source === null || flags.source === "bls") {
    yield* yieldBlsEvents({
      apiKey: process.env.BLS_API_KEY,
      since: flags.since,
      log,
    });
  }
  if ((flags.source === null || flags.source === "fomc") && fredKey) {
    yield* yieldFomcEvents({ apiKey: fredKey, since: flags.since, log });
  }
}

async function fetchPricesWithBackoff(
  releaseAt: Date,
  state: { consecutiveEmpty: number },
): Promise<ReturnType<typeof buildAssetReaction>[]> {
  const rows: ReturnType<typeof buildAssetReaction>[] = [];
  for (const symbol of ASSET_UNIVERSE) {
    let snapshot = await fetchPriceSnapshot(symbol, releaseAt);

    if (snapshot === null) {
      state.consecutiveEmpty += 1;
      if (state.consecutiveEmpty >= YAHOO_BACKOFF_THRESHOLD) {
        console.warn(
          `  ⏸ ${state.consecutiveEmpty} empty Yahoo responses in a row — backing off ${YAHOO_BACKOFF_MS / 1000}s`,
        );
        await sleep(YAHOO_BACKOFF_MS);
        snapshot = await fetchPriceSnapshot(symbol, releaseAt);
      }
    }

    // Single collection point: a snapshot recovered by the backoff retry is
    // kept exactly like a first-attempt success. Previously the push lived in
    // the `else` branch above, so every retried symbol was silently dropped.
    if (snapshot !== null) {
      state.consecutiveEmpty = 0;
      rows.push(buildAssetReaction(symbol, snapshot));
    }
    await sleep(PER_SYMBOL_DELAY_MS);
  }
  return rows;
}

async function ingestOne(
  prisma: PrismaClient | null,
  cand: CandidateEvent,
  flags: Flags,
  state: { consecutiveEmpty: number; accepted: Set<string> },
  stats: IngestStats,
): Promise<void> {
  stats.fetched += 1;

  // Releases accepted earlier in *this* run. A real run would have committed
  // them, so the database query below would catch the collision; a dry-run
  // commits nothing, so without this an overlapping FRED and BLS print of the
  // same month both counted as insertable and the preview overstated the real
  // run. A dry-run that does not predict the run is not a dry-run.
  const key = releaseKey(cand);
  if (state.accepted.has(key)) {
    stats.duplicates += 1;
    if (stats.duplicates <= 5 || stats.duplicates % 50 === 0) {
      console.log(`[${cand.source}] ⏭ Duplicate (same run): ${cand.headline}`);
    }
    return;
  }

  if (prisma) {
    // Duplicate = the SAME economic release, not merely the same event type on
    // the same day. Matching on (eventType, ±1 day) alone collapsed headline
    // CPI with Core CPI, PCE and Core PCE (all eventType=CPI, all dated to the
    // 1st of the reference month), and payrolls with the unemployment rate.
    //
    // `metricName` is canonical across sources (metrics.ts), so a BLS CPI-U
    // print and a FRED CPIAUCSL print still collide — which is what we want —
    // while genuinely different metrics survive.
    const dup = await prisma.event.findFirst({
      where: {
        OR: [
          { eventKey: cand.eventKey },
          {
            eventType: cand.eventType,
            occurredAt: {
              gte: startOfDay(cand.occurredAt),
              lte: endOfDay(cand.occurredAt),
            },
            dataReleases: { some: { metricName: cand.data.metricName } },
          },
        ],
      },
      select: { id: true },
    });
    if (dup) {
      stats.duplicates += 1;
      if (stats.duplicates <= 5 || stats.duplicates % 50 === 0) {
        console.log(`[${cand.source}] ⏭ Duplicate: ${cand.headline}`);
      }
      return;
    }
  }

  let assetRows: ReturnType<typeof buildAssetReaction>[] = [];
  const reactionEligible = isReactionTimingEligible({
    releaseAt: cand.releaseAt,
    timingStatus: cand.timingStatus,
    timingSource: cand.timingSource,
  });
  if (!flags.noPrices && reactionEligible && cand.releaseAt) {
    assetRows = await fetchPricesWithBackoff(cand.releaseAt, state);
    if (assetRows.length === 0) {
      stats.yahooSkipped += 1;
    }
  } else if (!flags.noPrices && !reactionEligible) {
    stats.timingSuppressed += 1;
    if (stats.timingSuppressed <= 5 || stats.timingSuppressed % 50 === 0) {
      console.log(
        `[${cand.source}] ⊘ Reactions suppressed (${cand.timingStatus}): ${cand.headline}`,
      );
    }
  }

  if (flags.dryRun || !prisma) {
    // Reached only after the dedup check above has actually run.
    state.accepted.add(key);
    stats.inserted += 1;
    stats.bySource[cand.source] += 1;
    console.log(
      `[${cand.source}] [dry] would insert: ${cand.headline} (${assetRows.length} assets)`,
    );
    if (!flags.noPrices) await sleep(PER_EVENT_DELAY_MS);
    return;
  }

  try {
    await prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          headline: cand.headline,
          eventType: cand.eventType,
          occurredAt: cand.occurredAt,
          eventKey: cand.eventKey,
          releaseAt: cand.releaseAt,
          releaseDate: cand.releaseDate,
          timingStatus: cand.timingStatus,
          timingSource: cand.timingSource,
          sourceUrl: cand.sourceUrl,
        },
        select: { id: true },
      });
      if (assetRows.length > 0) {
        await tx.assetReaction.createMany({
          data: assetRows.map((r) => ({
            eventId: event.id,
            assetSymbol: r.assetSymbol,
            anchorAt: r.anchorAt,
            calculationVersion: r.calculationVersion,
            priceAtEvent: r.priceAtEvent,
            price1h: r.price1h,
            price1d: r.price1d,
            price1w: r.price1w,
            pctChange1h: r.pctChange1h,
            pctChange1d: r.pctChange1d,
            pctChange1w: r.pctChange1w,
          })),
        });
      }
      await tx.dataRelease.create({
        data: {
          eventId: event.id,
          metricKey: cand.data.metricKey,
          metricName: cand.data.metricName,
          referencePeriodStart: cand.data.referencePeriodStart,
          actualValue: cand.data.actualValue,
          actualSource: cand.data.actualSource,
          actualSourceUrl: cand.data.actualSourceUrl,
          expectedValue: cand.data.expectedValue,
          consensusStatus: cand.data.consensusStatus,
          consensusSource: cand.data.consensusSource,
          consensusSourceUrl: cand.data.consensusSourceUrl,
          consensusAsOf: cand.data.consensusAsOf,
          priorValue: cand.data.priorValue,
          surpriseMagnitude: cand.data.surpriseMagnitude,
        },
      });
    });
    state.accepted.add(key);
    stats.inserted += 1;
    stats.bySource[cand.source] += 1;
    console.log(
      `[${cand.source}] ✓ Ingested: ${cand.headline}${
        flags.noPrices ? "" : ` (${assetRows.length} assets)`
      }`,
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    // The event_key and legacy headline+occurredAt constraints are the final
    // backstop if another writer inserts the same release after our read.
    if (/Unique constraint/.test(detail)) {
      stats.duplicates += 1;
      console.log(`[${cand.source}] ⏭ Identity collision: ${cand.headline}`);
    } else {
      console.error(`[${cand.source}] ✗ ${cand.headline} — ${detail}`);
    }
  }

  if (!flags.noPrices) await sleep(PER_EVENT_DELAY_MS);
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));

  console.log(
    `auto-ingest starting — source=${flags.source ?? "all"} since=${flags.since}` +
      `${flags.dryRun ? " dry-run" : ""}${flags.noPrices ? " no-prices" : ""}`,
  );

  // Dry-run still connects — reads (including the dedup check) run for real,
  // writes throw. See scripts/lib/readonly-prisma.ts.
  const prisma = flags.dryRun
    ? createDryRunPrismaClient()
    : createScriptPrismaClient();
  const stats: IngestStats = {
    fetched: 0,
    inserted: 0,
    duplicates: 0,
    yahooSkipped: 0,
    timingSuppressed: 0,
    bySource: { FRED: 0, BLS: 0, FOMC: 0 },
  };
  const runState = { consecutiveEmpty: 0, accepted: new Set<string>() };

  // Hard cutoff — BLS fetches by year so its candidates may pre-date --since.
  const sinceMs = new Date(flags.since).getTime();

  try {
    for await (const cand of candidates(flags)) {
      const cutoffDate = cand.data.referencePeriodStart ?? cand.occurredAt;
      if (cutoffDate.getTime() < sinceMs) continue;
      await ingestOne(prisma, cand, flags, runState, stats);
    }
  } finally {
    if (prisma) await prisma.$disconnect();
  }

  console.log("");
  console.log(
    `Summary: ${stats.inserted} ingested, ${stats.duplicates} skipped (duplicates), ` +
      `${stats.yahooSkipped} with empty Yahoo data`,
  );
  console.log(
    `  by source — FRED=${stats.bySource.FRED} BLS=${stats.bySource.BLS} FOMC=${stats.bySource.FOMC}`,
  );
  console.log(`  candidates fetched=${stats.fetched}`);
  console.log(`  reactions suppressed for timing=${stats.timingSuppressed}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
