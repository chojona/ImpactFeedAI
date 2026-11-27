#!/usr/bin/env tsx
/**
 * Backfill historical OHLCV candles around timing-eligible events.
 *
 * Default mode is plan-only dry-run (Postgres inventory + lookback math; no
 * provider calls). Live provider fetches and writes are gated:
 *
 *   npm run backfill:candles                              # plan only
 *   npm run backfill:candles -- --symbol SPY --limit 3
 *   CANDLE_SOURCE_PERMISSIONS_CONFIRMED=yahoo-finance2-terms-verified \
 *     npm run backfill:candles -- --execute                # live dry-run fetch
 *   CANDLE_SOURCE_PERMISSIONS_CONFIRMED=yahoo-finance2-terms-verified \
 *     CANDLE_BACKFILL_CONFIRM=WRITE_CANDLES \
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
 *   permissions — bulk live fetches and apply writes require an explicit
 *                 source-permissions confirmation; Yahoo terms are unverified.
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
import { fetchCandlesWithRetry } from "../ingest/candle-fetch-retry";
import {
  PRESERVATION_WINDOW_DAYS_EACH_SIDE,
  buildPreservationPlan,
  coverageKey,
  type PreservationWorkUnit,
} from "../ingest/candle-preservation-plan";
import { rowsFromOutcome } from "../ingest/candle-rows";
import {
  assertApplyWritesAllowed,
  assertLiveBulkFetchAllowed,
  resolveCandleSourcePermissions,
} from "../ingest/candle-source-permissions";
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
import { buildSessionCalendar } from "@/services/market/sessionCalendar";
import type { CandleInterval } from "@/types/market";

const newYorkDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** YYYY-MM-DD in America/New_York for a bar openTime. */
function newYorkDateString(date: Date): string {
  return newYorkDateFormatter.format(date);
}

const APPLY_CONFIRMATION = "WRITE_CANDLES";
const CONFIRMATION_ENV = "CANDLE_BACKFILL_CONFIRM";

const PER_REQUEST_DELAY_MS = 600;
const PER_EVENT_DELAY_MS = 1_000;

/** Prototype universe: both are split-free, so neither can trip the basis guard. */
const DEFAULT_SYMBOLS = ["SPY", "QQQ"] as const;
const DEFAULT_INTERVAL: CandleInterval = "ONE_HOUR";

interface Flags {
  /** Persist candles. Requires write confirm + permissions. */
  apply: boolean;
  /**
   * Call the live provider for remaining plan units without writing.
   * Requires permissions. Default false — plan-only.
   */
  execute: boolean;
  symbols: string[];
  interval: CandleInterval;
  limit: number | null;
  eventIds: string[];
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    apply: false,
    execute: false,
    symbols: [],
    interval: DEFAULT_INTERVAL,
    limit: null,
    eventIds: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      flags.apply = false;
      flags.execute = false;
    } else if (arg === "--apply") {
      flags.apply = true;
      flags.execute = true;
    } else if (arg === "--execute") {
      flags.execute = true;
    } else if (arg === "--symbol") {
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

Plan-only by default (no provider calls, no writes).
Live bulk fetches require ${resolveCandleSourcePermissions().confirmationEnv}=${resolveCandleSourcePermissions().confirmationValue}.
Applying also requires ${CONFIRMATION_ENV}=${APPLY_CONFIRMATION}.

Options:
  --dry-run            Plan only; write nothing; call no provider. (default)
  --execute            Fetch remaining units from the provider without writing.
  --apply              Persist candles (implies --execute).
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
  pairsSkippedCovered: number;
  pairsUnreachable: number;
  pairsBasisRejected: number;
  pairsProviderError: number;
  pairsEmpty: number;
  providerRetries: number;
  candlesFetched: number;
  candlesMalformed: number;
  candlesInserted: number;
  candlesAlreadyPresent: number;
  volumeWithheld: number;
}

const emptyStats = (): Stats => ({
  eventsConsidered: 0,
  pairsAttempted: 0,
  pairsSkippedCovered: 0,
  pairsUnreachable: 0,
  pairsBasisRejected: 0,
  pairsProviderError: 0,
  pairsEmpty: 0,
  providerRetries: 0,
  candlesFetched: 0,
  candlesMalformed: 0,
  candlesInserted: 0,
  candlesAlreadyPresent: 0,
  volumeWithheld: 0,
});

async function storedOpenTimesInWindow(
  prisma: PrismaClient,
  symbol: string,
  interval: CandleInterval,
  from: Date,
  to: Date,
): Promise<Date[]> {
  const rows = await prisma.candle.findMany({
    where: {
      symbol,
      interval,
      ingestionVersion: CURRENT_CANDLE_INGESTION_VERSION,
      openTime: { gte: from, lte: to },
    },
    select: { openTime: true },
    orderBy: { openTime: "asc" },
  });
  return rows.map((row) => row.openTime);
}

/**
 * Session days for grid verification come from stored SPY daily bars only —
 * never from a live provider call. An empty calendar fails closed (no skips).
 */
async function loadSpySessionCalendar(
  prisma: PrismaClient,
  from: Date,
  to: Date,
): Promise<ReturnType<typeof buildSessionCalendar>> {
  const padMs = 5 * 86_400_000;
  const rows = await prisma.candle.findMany({
    where: {
      symbol: "SPY",
      interval: "ONE_DAY",
      ingestionVersion: CURRENT_CANDLE_INGESTION_VERSION,
      openTime: {
        gte: new Date(from.getTime() - padMs),
        lte: new Date(to.getTime() + padMs),
      },
    },
    select: { openTime: true },
    orderBy: { openTime: "asc" },
  });
  const days = [
    ...new Set(rows.map((row) => newYorkDateString(row.openTime))),
  ].sort();
  return buildSessionCalendar(days);
}

async function processUnit(
  prisma: PrismaClient,
  provider: CandleProvider,
  unit: PreservationWorkUnit,
  apply: boolean,
  stats: Stats,
): Promise<void> {
  stats.pairsAttempted += 1;

  const { outcome, attempts } = await fetchCandlesWithRetry(
    () =>
      provider.fetchCandles({
        symbol: unit.symbol,
        interval: unit.interval,
        from: unit.from,
        to: unit.to,
      }),
    {
      sleep,
      onRetry: ({ attempt, delayMs, reason }) => {
        stats.providerRetries += 1;
        console.log(
          `    ${unit.symbol.padEnd(6)} retry ${attempt} after provider error — ${reason} (sleep ${delayMs}ms)`,
        );
      },
    },
  );

  if (attempts > 1 && outcome.status !== "provider_error") {
    console.log(
      `    ${unit.symbol.padEnd(6)} recovered after ${attempts} attempt(s)`,
    );
  }

  if (outcome.status === "unreachable") {
    stats.pairsUnreachable += 1;
    console.log(`    ${unit.symbol.padEnd(6)} unreachable — ${outcome.reason}`);
    return;
  }
  if (outcome.status === "basis_rejected") {
    stats.pairsBasisRejected += 1;
    console.log(
      `    ${unit.symbol.padEnd(6)} BASIS-REJECTED — ${outcome.reason}\n` +
        `    ${" ".repeat(6)} zero candles written for this pair; prices are NOT rescaled`,
    );
    return;
  }
  if (outcome.status === "provider_error") {
    stats.pairsProviderError += 1;
    console.log(
      `    ${unit.symbol.padEnd(6)} provider error after ${attempts} attempt(s) — ${outcome.reason}`,
    );
    return;
  }
  if (outcome.status === "empty") {
    stats.pairsEmpty += 1;
    console.log(`    ${unit.symbol.padEnd(6)} no bars — ${outcome.reason}`);
    return;
  }

  stats.candlesFetched += outcome.candles.length;
  stats.volumeWithheld += outcome.volumeWithheld;

  const { rows, malformed } = rowsFromOutcome(
    outcome,
    unit.symbol,
    unit.interval,
    provider.id,
    new Date(),
  );
  stats.candlesMalformed += malformed;

  if (rows.length === 0) {
    console.log(`    ${unit.symbol.padEnd(6)} nothing coherent to write`);
    return;
  }

  if (!apply) {
    const existing = await prisma.candle.count({
      where: {
        symbol: unit.symbol,
        interval: unit.interval,
        priceBasis: outcome.priceBasis,
        openTime: { in: rows.map((r) => r.openTime) },
      },
    });
    stats.candlesAlreadyPresent += existing;
    stats.candlesInserted += rows.length - existing;
    console.log(
      `    ${unit.symbol.padEnd(6)} would insert ${String(rows.length - existing).padStart(3)}` +
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
    `    ${unit.symbol.padEnd(6)} inserted ${String(result.count).padStart(3)}` +
      ` · already present ${String(rows.length - result.count).padStart(3)}` +
      ` · basis ${outcome.priceBasis}` +
      ` · volume withheld ${outcome.volumeWithheld}` +
      (malformed > 0 ? ` · malformed ${malformed}` : ""),
  );
}

function modeLabel(flags: Flags): string {
  if (flags.apply) return "APPLY — writing";
  if (flags.execute) return "EXECUTE — live fetch, no writes";
  return "PLAN — no provider calls, no writes";
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const permissions = resolveCandleSourcePermissions();

  if (flags.apply) {
    if (process.env[CONFIRMATION_ENV] !== APPLY_CONFIRMATION) {
      console.error(
        `Refusing to write. --apply requires ${CONFIRMATION_ENV}=${APPLY_CONFIRMATION} ` +
          `in the environment.`,
      );
      process.exit(2);
    }
    try {
      assertApplyWritesAllowed();
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exit(2);
    }
  } else if (flags.execute) {
    try {
      assertLiveBulkFetchAllowed();
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exit(2);
    }
  }

  const prisma = flags.apply
    ? createScriptPrismaClient()
    : createDryRunPrismaClient();

  const stats = emptyStats();

  console.log(`backfill-candles (${modeLabel(flags)})`);
  console.log(
    `  permissions  ${permissions.status} (${permissions.source})`,
  );
  console.log(
    `  interval  ${flags.interval} (${INTERVAL_CODE[flags.interval]})   ` +
      `symbols  ${flags.symbols.join(", ")}`,
  );
  console.log(`  version   ${CURRENT_CANDLE_INGESTION_VERSION}`);
  console.log(
    `  window    ±${PRESERVATION_WINDOW_DAYS_EACH_SIDE} calendar days around each release instant\n`,
  );

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

    const timingEvents = events
      .filter((event): event is typeof event & { releaseAt: Date } =>
        event.releaseAt !== null,
      )
      .map((event) => ({
        id: event.id,
        releaseAt: event.releaseAt,
        headline: event.headline,
        eventType: event.eventType,
      }));

    const now = new Date();
    const coverageCache = new Map<string, Date[]>();

    // Skeleton pass discovers ranked windows with an empty calendar (no skips).
    // Second pass loads SPY daily session days + stored openTimes for grid checks.
    const skeleton = buildPreservationPlan({
      events: timingEvents,
      symbols: flags.symbols,
      interval: flags.interval,
      calendar: buildSessionCalendar([]),
      now,
      limit: flags.limit,
      coverageFor: ({ symbol, interval }) => ({
        symbol,
        interval,
        storedOpenTimes: [],
      }),
    });

    let planFrom = now;
    let planTo = now;
    for (const unit of skeleton.units) {
      if (unit.from < planFrom) planFrom = unit.from;
      if (unit.to > planTo) planTo = unit.to;
    }
    for (const window of skeleton.windows) {
      if (window.from < planFrom) planFrom = window.from;
      if (window.to > planTo) planTo = window.to;
    }

    const calendar = await loadSpySessionCalendar(prisma, planFrom, planTo);

    for (const unit of skeleton.units) {
      const key = coverageKey(
        unit.symbol,
        unit.interval,
        unit.from,
        unit.to,
      );
      if (!coverageCache.has(key)) {
        coverageCache.set(
          key,
          await storedOpenTimesInWindow(
            prisma,
            unit.symbol,
            unit.interval,
            unit.from,
            unit.to,
          ),
        );
      }
    }

    const plan = buildPreservationPlan({
      events: timingEvents,
      symbols: flags.symbols,
      interval: flags.interval,
      calendar,
      now,
      limit: flags.limit,
      coverageFor: ({ symbol, interval, from, to }) => ({
        symbol,
        interval,
        storedOpenTimes:
          coverageCache.get(coverageKey(symbol, interval, from, to)) ?? [],
      }),
    });

    const unreachable = plan.windows.filter((w) => !w.reachable).length;
    console.log(
      `Timing-eligible events: ${timingEvents.length}   ` +
        `reachable at ${INTERVAL_CODE[flags.interval]}: ${plan.windows.length - unreachable}   ` +
        `outside the provider window: ${unreachable}`,
    );

    for (const window of plan.windows) {
      if (window.reachable) continue;
      const event = timingEvents.find((e) => e.id === window.eventId);
      console.log(
        `  SKIP ${window.releaseAt.toISOString().slice(0, 10)} ${(event?.eventType ?? "").padEnd(13)} ` +
          `${(event?.headline ?? "").slice(0, 44)} — outside the ${INTERVAL_CODE[flags.interval]} window`,
      );
    }

    console.log(
      `\nPlan: ${plan.remaining.length} remaining unit(s), ` +
        `${plan.skippedFullyCovered} skipped (fully covered), ` +
        `upper-bound estimate ${plan.estimatedRowsUpperBound.toLocaleString()} rows`,
    );

    console.log(
      `Session calendar: ${calendar.sessionDays.length} SPY daily day(s) in range ` +
        `(grid skip requires stored regular-session openTimes; count alone never skips)`,
    );

    for (const unit of plan.units) {
      const days =
        unit.daysRemaining === null
          ? "n/a"
          : `${unit.daysRemaining.toFixed(1)}d left`;
      const flag = unit.approachingLoss ? " AT-RISK" : "";
      const skip = unit.skippedFullyCovered
        ? " SKIP covered"
        : unit.unverifiableReason !== null
          ? ` need ≤${unit.estimatedRowsUpperBound} (unverifiable: ${unit.unverifiableReason})`
          : ` need ≤${unit.estimatedRowsUpperBound} (missing ${unit.missingCriticalCount})`;
      console.log(
        `  ${unit.releaseAt.toISOString().slice(0, 16)}  ${unit.symbol.padEnd(6)} ` +
          `stored ${String(unit.storedCount).padStart(3)}/${String(unit.minExpectedBars).padStart(3)}` +
          `  ${days}${flag}${skip}`,
      );
    }

    if (!flags.execute) {
      console.log(
        `\nNothing was fetched or written. Source permissions: ${permissions.status}.`,
      );
      console.log(
        `To live-fetch without writing:\n  ${permissions.confirmationEnv}=${permissions.confirmationValue} npm run backfill:candles -- --execute`,
      );
      console.log(
        `To apply:\n  ${permissions.confirmationEnv}=${permissions.confirmationValue} ${CONFIRMATION_ENV}=${APPLY_CONFIRMATION} npm run backfill:candles -- --apply`,
      );
      return;
    }

    const provider = createYahooCandleProvider();
    if (!provider.supports(flags.interval)) {
      console.error(`Provider ${provider.id} cannot serve ${flags.interval}.`);
      process.exit(2);
    }
    console.log(`\n  provider  ${provider.id}\n`);

    let lastEventId: string | null = null;
    for (const unit of plan.units) {
      if (unit.eventId !== lastEventId) {
        if (lastEventId !== null) await sleep(PER_EVENT_DELAY_MS);
        stats.eventsConsidered += 1;
        const event = timingEvents.find((e) => e.id === unit.eventId);
        console.log(
          `  ${unit.releaseAt.toISOString().slice(0, 16)}  ${(event?.eventType ?? "").padEnd(13)} ` +
            `${(event?.headline ?? "").slice(0, 44)}`,
        );
        lastEventId = unit.eventId;
      }

      if (unit.skippedFullyCovered) {
        stats.pairsSkippedCovered += 1;
        console.log(
          `    ${unit.symbol.padEnd(6)} skip — expected grid complete ` +
            `(${unit.storedCount} stored, ${unit.minExpectedBars} critical openTimes)`,
        );
        continue;
      }

      await processUnit(prisma, provider, unit, flags.apply, stats);
      await sleep(PER_REQUEST_DELAY_MS);
    }

    console.log(`\n${flags.apply ? "Applied" : "Execute dry-run"} summary`);
    console.log(`  events considered      ${stats.eventsConsidered}`);
    console.log(`  event·symbol attempted ${stats.pairsAttempted}`);
    console.log(`  skipped (covered)      ${stats.pairsSkippedCovered}`);
    console.log(`  unreachable            ${stats.pairsUnreachable}`);
    console.log(`  basis-rejected         ${stats.pairsBasisRejected}`);
    console.log(`  provider errors        ${stats.pairsProviderError}`);
    console.log(`  provider retries       ${stats.providerRetries}`);
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
        `\nNothing was written. To apply:\n  ${permissions.confirmationEnv}=${permissions.confirmationValue} ${CONFIRMATION_ENV}=${APPLY_CONFIRMATION} npm run backfill:candles -- --apply`,
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
