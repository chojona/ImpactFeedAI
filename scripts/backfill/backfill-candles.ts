#!/usr/bin/env tsx
/**
 * Backfill historical OHLCV candles around timing-eligible events.
 *
 * Default mode is dry-run. Applying is deliberately cumbersome:
 *
 *   npm run backfill:candles                              # dry-run, writes nothing
 *   npm run backfill:candles -- --symbol SPY --limit 3    # narrow dry-run
 *   CANDLE_BACKFILL_CONFIRM=WRITE_CANDLES \
 *     npm run backfill:candles -- --apply
 *
 * Properties:
 *   idempotent  — inserts use skipDuplicates against the
 *                 (symbol, interval, open_time, price_basis) unique index, so a
 *                 second run inserts nothing and reports every bar as present.
 *   resumable   — each event·symbol pair is committed on its own, oldest first.
 *                 Ctrl-C leaves a consistent database; re-run to continue.
 *   additive    — never updates or deletes a Candle row. Correcting stored
 *                 candles is a separate, explicit operation.
 *   fail-closed — an unreachable window, an unverifiable price basis or an
 *                 incoherent bar produces zero rows and a counted reason. It
 *                 never falls back to a coarser interval, never rescales prices
 *                 and never fabricates a bar.
 *
 * Oldest reachable events are processed first on purpose. The provider's
 * intraday history is a *rolling* window, so the oldest events are the ones
 * about to fall out of reach permanently — they are the only ones where delay
 * causes irreversible loss.
 */
import "dotenv/config";

import {
  createYahooCandleProvider,
  type CandleProvider,
} from "../ingest/candle-provider";
import { rowsFromOutcome } from "../ingest/candle-rows";
import { estimateCandleRows } from "../ingest/candle-semantics";
import { sleep } from "../ingest/fetch-prices";
import { createScriptPrismaClient } from "../lib/prisma";
import { createDryRunPrismaClient } from "../lib/readonly-prisma";
import type { PrismaClient } from "../../src/generated/prisma/client";
import {
  ALL_INTERVAL_CODES,
  CURRENT_CANDLE_INGESTION_VERSION,
  INTERVAL_CODE,
  intervalFromCode,
} from "@/services/market/candles";
import { REACTION_ELIGIBLE_TIMING_STATUSES } from "@/services/events/timing";
import type { CandleInterval } from "@/types/market";

const APPLY_CONFIRMATION = "WRITE_CANDLES";
const CONFIRMATION_ENV = "CANDLE_BACKFILL_CONFIRM";

const DAY_MS = 86_400_000;
const PER_REQUEST_DELAY_MS = 600;
const PER_EVENT_DELAY_MS = 1_000;

/** Prototype universe: both are split-free, so neither can trip the basis guard. */
const DEFAULT_SYMBOLS = ["SPY", "QQQ"] as const;
const DEFAULT_INTERVAL: CandleInterval = "ONE_HOUR";

/**
 * Calendar days fetched either side of the release instant. Wider than the
 * "±1 trading day" target so a weekend or holiday cannot leave the event
 * session at the very edge of the window.
 */
const WINDOW_DAYS_EACH_SIDE = 2;

interface Flags {
  apply: boolean;
  symbols: string[];
  interval: CandleInterval;
  limit: number | null;
  eventIds: string[];
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    apply: false,
    symbols: [],
    interval: DEFAULT_INTERVAL,
    limit: null,
    eventIds: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") flags.apply = false;
    else if (arg === "--apply") flags.apply = true;
    else if (arg === "--symbol") {
      const value = argv[++i];
      if (!value) throw new Error("--symbol requires a value");
      flags.symbols.push(value.toUpperCase());
    } else if (arg === "--interval") {
      const value = argv[++i];
      if (!value) throw new Error("--interval requires a value");
      const interval = intervalFromCode(value);
      if (interval === null) {
        throw new Error(
          `--interval must be one of ${ALL_INTERVAL_CODES.join(", ")}`,
        );
      }
      flags.interval = interval;
    } else if (arg === "--event-id") {
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
      console.log(`Usage: tsx scripts/backfill/backfill-candles.ts [options]

Dry-run by default. Applying requires ${CONFIRMATION_ENV}=${APPLY_CONFIRMATION}.

Options:
  --dry-run            Report what would be written; write nothing. (default)
  --apply              Persist candles. Requires the confirmation variable.
  --symbol <TICKER>    Symbol to backfill; may be repeated.
                       Default: ${DEFAULT_SYMBOLS.join(", ")}.
  --interval <CODE>    One of ${ALL_INTERVAL_CODES.join(", ")}. Default: ${INTERVAL_CODE[DEFAULT_INTERVAL]}.
  --event-id <uuid>    Restrict to one event; may be repeated.
  --limit <n>          Process at most n events.
  -h, --help           Show this help.`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (flags.symbols.length === 0) flags.symbols.push(...DEFAULT_SYMBOLS);
  return flags;
}

interface Stats {
  eventsConsidered: number;
  pairsAttempted: number;
  pairsUnreachable: number;
  pairsBasisRejected: number;
  pairsProviderError: number;
  pairsEmpty: number;
  candlesFetched: number;
  candlesMalformed: number;
  candlesInserted: number;
  candlesAlreadyPresent: number;
  volumeWithheld: number;
}

const emptyStats = (): Stats => ({
  eventsConsidered: 0,
  pairsAttempted: 0,
  pairsUnreachable: 0,
  pairsBasisRejected: 0,
  pairsProviderError: 0,
  pairsEmpty: 0,
  candlesFetched: 0,
  candlesMalformed: 0,
  candlesInserted: 0,
  candlesAlreadyPresent: 0,
  volumeWithheld: 0,
});

async function processPair(
  prisma: PrismaClient,
  provider: CandleProvider,
  symbol: string,
  interval: CandleInterval,
  releaseAt: Date,
  apply: boolean,
  stats: Stats,
): Promise<void> {
  stats.pairsAttempted += 1;

  const from = new Date(releaseAt.getTime() - WINDOW_DAYS_EACH_SIDE * DAY_MS);
  const to = new Date(releaseAt.getTime() + WINDOW_DAYS_EACH_SIDE * DAY_MS);

  const outcome = await provider.fetchCandles({ symbol, interval, from, to });

  if (outcome.status === "unreachable") {
    stats.pairsUnreachable += 1;
    console.log(`    ${symbol.padEnd(6)} unreachable — ${outcome.reason}`);
    return;
  }
  if (outcome.status === "basis_rejected") {
    stats.pairsBasisRejected += 1;
    console.log(
      `    ${symbol.padEnd(6)} BASIS-REJECTED — ${outcome.reason}\n` +
        `    ${" ".repeat(6)} zero candles written for this pair; prices are NOT rescaled`,
    );
    return;
  }
  if (outcome.status === "provider_error") {
    stats.pairsProviderError += 1;
    console.log(`    ${symbol.padEnd(6)} provider error — ${outcome.reason}`);
    return;
  }
  if (outcome.status === "empty") {
    stats.pairsEmpty += 1;
    console.log(`    ${symbol.padEnd(6)} no bars — ${outcome.reason}`);
    return;
  }

  stats.candlesFetched += outcome.candles.length;
  stats.volumeWithheld += outcome.volumeWithheld;

  const { rows, malformed } = rowsFromOutcome(
    outcome,
    symbol,
    interval,
    provider.id,
    new Date(),
  );
  stats.candlesMalformed += malformed;

  if (rows.length === 0) {
    console.log(`    ${symbol.padEnd(6)} nothing coherent to write`);
    return;
  }

  if (!apply) {
    // Count what a real run would insert, without writing. The unique index is
    // the authority on duplicates, so a dry-run asks the database rather than
    // guessing.
    const existing = await prisma.candle.count({
      where: {
        symbol,
        interval,
        priceBasis: outcome.priceBasis,
        openTime: { in: rows.map((r) => r.openTime) },
      },
    });
    stats.candlesAlreadyPresent += existing;
    stats.candlesInserted += rows.length - existing;
    console.log(
      `    ${symbol.padEnd(6)} would insert ${String(rows.length - existing).padStart(3)}` +
        ` · already present ${String(existing).padStart(3)}` +
        ` · basis ${outcome.priceBasis}` +
        ` · volume withheld ${outcome.volumeWithheld}` +
        (malformed > 0 ? ` · malformed ${malformed}` : ""),
    );
    return;
  }

  const result = await prisma.candle.createMany({
    data: rows,
    skipDuplicates: true,
  });
  stats.candlesInserted += result.count;
  stats.candlesAlreadyPresent += rows.length - result.count;

  console.log(
    `    ${symbol.padEnd(6)} inserted ${String(result.count).padStart(3)}` +
      ` · already present ${String(rows.length - result.count).padStart(3)}` +
      ` · basis ${outcome.priceBasis}` +
      ` · volume withheld ${outcome.volumeWithheld}` +
      (malformed > 0 ? ` · malformed ${malformed}` : ""),
  );
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));

  if (flags.apply && process.env[CONFIRMATION_ENV] !== APPLY_CONFIRMATION) {
    console.error(
      `Refusing to write. --apply requires ${CONFIRMATION_ENV}=${APPLY_CONFIRMATION} ` +
        `in the environment.`,
    );
    process.exit(2);
  }

  const prisma = flags.apply
    ? createScriptPrismaClient()
    : createDryRunPrismaClient();
  const provider = createYahooCandleProvider();

  if (!provider.supports(flags.interval)) {
    console.error(`Provider ${provider.id} cannot serve ${flags.interval}.`);
    process.exit(2);
  }

  const stats = emptyStats();

  console.log(
    `backfill-candles${flags.apply ? " (APPLY — writing)" : " (dry-run — no writes)"}`,
  );
  console.log(`  provider  ${provider.id}`);
  console.log(
    `  interval  ${flags.interval} (${INTERVAL_CODE[flags.interval]})   ` +
      `symbols  ${flags.symbols.join(", ")}`,
  );
  console.log(`  version   ${CURRENT_CANDLE_INGESTION_VERSION}`);
  console.log(
    `  window    ±${WINDOW_DAYS_EACH_SIDE} calendar days around each release instant\n`,
  );

  try {
    // Only timing-eligible events: an event whose release instant is not
    // defensible has no market-facing moment for candles to be centred on, and
    // the rest of the product already refuses to anchor anything to it.
    const events = await prisma.event.findMany({
      where: {
        timingStatus: { in: [...REACTION_ELIGIBLE_TIMING_STATUSES] },
        releaseAt: { not: null },
        timingSource: { not: null },
        ...(flags.eventIds.length > 0 ? { id: { in: flags.eventIds } } : {}),
      },
      // Oldest first: the rolling provider window drops these first.
      orderBy: [{ releaseAt: "asc" }, { id: "asc" }],
      select: { id: true, headline: true, eventType: true, releaseAt: true },
    });

    const reachable = events.filter(
      (event) =>
        event.releaseAt !== null &&
        provider.reachable(flags.interval, event.releaseAt),
    );
    const unreachable = events.length - reachable.length;

    console.log(
      `Timing-eligible events: ${events.length}   ` +
        `reachable at ${INTERVAL_CODE[flags.interval]}: ${reachable.length}   ` +
        `outside the provider window: ${unreachable}`,
    );

    for (const event of events) {
      if (event.releaseAt === null) continue;
      if (provider.reachable(flags.interval, event.releaseAt)) continue;
      console.log(
        `  SKIP ${event.releaseAt.toISOString().slice(0, 10)} ${event.eventType.padEnd(13)} ` +
          `${event.headline.slice(0, 44)} — outside the ${INTERVAL_CODE[flags.interval]} window`,
      );
    }

    const selected =
      flags.limit === null ? reachable : reachable.slice(0, flags.limit);

    console.log(
      `\nUpper-bound estimate: ${estimateCandleRows({
        interval: flags.interval,
        sessionsPerEvent: 2 * WINDOW_DAYS_EACH_SIDE + 1,
        events: selected.length,
        symbols: flags.symbols.length,
        includeExtended: true,
      }).toLocaleString()} rows ` +
        `(${selected.length} events × ${flags.symbols.length} symbols)\n`,
    );

    for (const event of selected) {
      stats.eventsConsidered += 1;
      console.log(
        `  ${event.releaseAt!.toISOString().slice(0, 16)}  ${event.eventType.padEnd(13)} ` +
          `${event.headline.slice(0, 44)}`,
      );

      for (const symbol of flags.symbols) {
        await processPair(
          prisma,
          provider,
          symbol,
          flags.interval,
          event.releaseAt!,
          flags.apply,
          stats,
        );
        await sleep(PER_REQUEST_DELAY_MS);
      }
      await sleep(PER_EVENT_DELAY_MS);
    }

    console.log(`\n${flags.apply ? "Applied" : "Dry run"} summary`);
    console.log(`  events considered      ${stats.eventsConsidered}`);
    console.log(`  event·symbol attempted ${stats.pairsAttempted}`);
    console.log(`  unreachable            ${stats.pairsUnreachable}`);
    console.log(`  basis-rejected         ${stats.pairsBasisRejected}`);
    console.log(`  provider errors        ${stats.pairsProviderError}`);
    console.log(`  empty responses        ${stats.pairsEmpty}`);
    console.log(`  candles fetched        ${stats.candlesFetched}`);
    console.log(`  malformed (dropped)    ${stats.candlesMalformed}`);
    console.log(
      `  ${flags.apply ? "inserted             " : "would insert         "}  ${stats.candlesInserted}`,
    );
    console.log(`  already present        ${stats.candlesAlreadyPresent}`);
    console.log(`  volume withheld → NULL ${stats.volumeWithheld}`);

    if (!flags.apply) {
      console.log(
        `\nNothing was written. To apply:\n  ${CONFIRMATION_ENV}=${APPLY_CONFIRMATION} npm run backfill:candles -- --apply`,
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
