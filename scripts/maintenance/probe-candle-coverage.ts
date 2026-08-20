#!/usr/bin/env tsx
/**
 * Report what candle coverage the price provider can actually supply for the
 * events already in the database.
 *
 * **This script is read-only in both directions.** It uses the write-blocking
 * Prisma client, so there is no code path that can mutate the database, and it
 * writes nothing to the provider either. It exists to answer the question that
 * has to be settled before any candle storage is designed: for each event, is
 * there still intraday history to store, and are the provider's intraday and
 * daily series on the same price basis?
 *
 *   npm run probe:candles                    # every timing-eligible event
 *   npm run probe:candles -- --symbol SPY --symbol XLK
 *   npm run probe:candles -- --limit 5 --interval 1h
 *
 * It fabricates nothing. An interval outside the provider's rolling window is
 * reported as unreachable rather than substituted with a coarser one, and a
 * symbol whose intraday and daily series disagree on basis is reported as
 * BASIS-MISMATCH rather than being silently reconciled.
 */
import "dotenv/config";

import YahooFinance from "yahoo-finance2";

import {
  INTERVAL_LOOKBACK_DAYS,
  classifySession,
  intervalReachableAt,
  normalizeProviderVolume,
} from "../ingest/candle-semantics";
import {
  intradayDailyBasisRatio,
  seriesShareBasis,
  type Candle,
} from "../ingest/fetch-prices";
import { createDryRunPrismaClient } from "../lib/readonly-prisma";
import { REACTION_ELIGIBLE_TIMING_STATUSES } from "@/services/events/timing";
import {
  ALL_INTERVAL_CODES,
  INTERVAL_CODE,
  intervalFromCode,
} from "@/services/market/candles";
import type { CandleInterval } from "@/types/market";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey", "ripHistorical"],
});

const DAY_MS = 86_400_000;
const PER_REQUEST_DELAY_MS = 600;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const PROBE_INTERVALS: CandleInterval[] = [
  "ONE_MINUTE",
  "FIVE_MINUTE",
  "FIFTEEN_MINUTE",
  "ONE_HOUR",
];

interface Flags {
  symbols: string[];
  intervals: CandleInterval[];
  limit: number | null;
  sessionsPerSide: number;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    symbols: [],
    intervals: [],
    limit: null,
    sessionsPerSide: 1,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--symbol") {
      const value = argv[++i];
      if (!value) throw new Error("--symbol requires a value");
      flags.symbols.push(value.toUpperCase());
    } else if (arg === "--interval") {
      const value = argv[++i];
      const interval = value === undefined ? null : intervalFromCode(value);
      if (interval === null) {
        throw new Error(
          `--interval must be one of ${ALL_INTERVAL_CODES.join(", ")}`,
        );
      }
      flags.intervals.push(interval);
    } else if (arg === "--limit") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error("--limit requires a positive integer");
      }
      flags.limit = n;
    } else if (arg === "-h" || arg === "--help") {
      console.log(`Usage: tsx scripts/maintenance/probe-candle-coverage.ts [options]

Read-only. Never writes to the database or the provider.

Options:
  --symbol <TICKER>    Probe this symbol; may be repeated. Default: SPY.
  --interval <IV>      Probe this interval; may be repeated.
                       Default: ${PROBE_INTERVALS.map((i) => INTERVAL_CODE[i]).join(", ")}.
  --limit <n>          Probe at most n events (newest first).
  -h, --help           Show this help.`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (flags.symbols.length === 0) flags.symbols.push("SPY");
  if (flags.intervals.length === 0) flags.intervals.push(...PROBE_INTERVALS);
  return flags;
}

interface IntervalResult {
  interval: CandleInterval;
  /** False when the event predates the provider's rolling window. */
  reachable: boolean;
  bars: number | null;
  regular: number | null;
  extended: number | null;
  /** Bars whose provider volume was a fabricated extended-hours zero. */
  volumeWithheld: number | null;
  error: string | null;
}

async function probeInterval(
  symbol: string,
  interval: CandleInterval,
  releaseAt: Date,
  sessionsPerSide: number,
): Promise<IntervalResult> {
  if (!intervalReachableAt(interval, releaseAt)) {
    return {
      interval,
      reachable: false,
      bars: null,
      regular: null,
      extended: null,
      volumeWithheld: null,
      error: null,
    };
  }

  const span = (sessionsPerSide + 0.5) * DAY_MS;
  try {
    const result = await yahooFinance.chart(symbol, {
      period1: new Date(releaseAt.getTime() - span),
      period2: new Date(releaseAt.getTime() + span),
      interval: INTERVAL_CODE[interval] as "1m" | "5m" | "15m" | "30m" | "1h" | "1d",
      return: "array",
    });
    const quotes = result.quotes ?? [];
    let regular = 0;
    let extended = 0;
    let volumeWithheld = 0;
    for (const quote of quotes) {
      const session = classifySession(quote.date);
      if (session === "REGULAR") regular += 1;
      else extended += 1;
      if (
        normalizeProviderVolume(quote.volume ?? null, session) === null &&
        quote.volume !== null &&
        quote.volume !== undefined
      ) {
        volumeWithheld += 1;
      }
    }
    return {
      interval,
      reachable: true,
      bars: quotes.length,
      regular,
      extended,
      volumeWithheld,
      error: null,
    };
  } catch (error) {
    return {
      interval,
      reachable: true,
      bars: null,
      regular: null,
      extended: null,
      volumeWithheld: null,
      error: error instanceof Error ? error.message.slice(0, 90) : String(error),
    };
  }
}

/**
 * Compare the provider's intraday and daily series for one event, using the
 * same guard the production reaction path uses. Reported, never repaired.
 */
async function probeBasis(
  symbol: string,
  releaseAt: Date,
): Promise<{ ratio: number | null; shares: boolean; note: string }> {
  if (!intervalReachableAt("ONE_HOUR", releaseAt)) {
    return { ratio: null, shares: true, note: "no intraday window" };
  }
  const toCandles = (quotes: readonly { date: Date; open: number | null; close: number | null }[]): Candle[] =>
    quotes.map((q) => ({ date: q.date, open: q.open, close: q.close }));

  try {
    const intraday = await yahooFinance.chart(symbol, {
      period1: new Date(releaseAt.getTime() - DAY_MS),
      period2: new Date(releaseAt.getTime() + DAY_MS),
      interval: "1h",
      return: "array",
    });
    await sleep(PER_REQUEST_DELAY_MS);
    const daily = await yahooFinance.chart(symbol, {
      period1: new Date(releaseAt.getTime() - 5 * DAY_MS),
      period2: new Date(releaseAt.getTime() + 5 * DAY_MS),
      interval: "1d",
      return: "array",
    });
    const ratio = intradayDailyBasisRatio(
      toCandles(intraday.quotes),
      toCandles(daily.quotes),
    );
    return {
      ratio,
      shares: seriesShareBasis(ratio),
      note: ratio === null ? "no overlapping session" : "",
    };
  } catch (error) {
    return {
      ratio: null,
      shares: true,
      note: error instanceof Error ? error.message.slice(0, 60) : "probe failed",
    };
  }
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  // Write-blocking client: this script must never be able to mutate anything.
  const prisma = createDryRunPrismaClient();

  console.log("probe-candle-coverage — read-only, writes nothing\n");
  console.log(
    `Provider lookback (measured): ${Object.entries(INTERVAL_LOOKBACK_DAYS)
      .map(([k, v]) => `${INTERVAL_CODE[k as CandleInterval]}=${v ?? "full"}`)
      .join("  ")}\n`,
  );

  try {
    const events = await prisma.event.findMany({
      where: {
        timingStatus: { in: [...REACTION_ELIGIBLE_TIMING_STATUSES] },
        releaseAt: { not: null },
        timingSource: { not: null },
      },
      orderBy: { releaseAt: "desc" },
      ...(flags.limit === null ? {} : { take: flags.limit }),
      select: { id: true, headline: true, eventType: true, releaseAt: true },
    });

    if (events.length === 0) {
      console.log("No timing-eligible event to probe.");
      return;
    }

    const reachableCount = new Map<CandleInterval, number>();
    let basisMismatches = 0;

    for (const event of events) {
      const releaseAt = event.releaseAt!;
      const ageDays = Math.floor((Date.now() - releaseAt.getTime()) / DAY_MS);
      console.log(
        `${releaseAt.toISOString().slice(0, 16)}  ${String(ageDays).padStart(5)}d  ` +
          `${event.eventType.padEnd(13)} ${event.headline.slice(0, 46)}`,
      );

      for (const symbol of flags.symbols) {
        for (const interval of flags.intervals) {
          const r = await probeInterval(
            symbol,
            interval,
            releaseAt,
            flags.sessionsPerSide,
          );
          if (!r.reachable) {
            console.log(
              `    ${symbol.padEnd(9)} ${INTERVAL_CODE[r.interval].padEnd(4)} unreachable — older than the ${INTERVAL_LOOKBACK_DAYS[interval]}-day window`,
            );
            continue;
          }
          if (r.error !== null) {
            console.log(
              `    ${symbol.padEnd(9)} ${INTERVAL_CODE[r.interval].padEnd(4)} provider error — ${r.error}`,
            );
            continue;
          }
          reachableCount.set(
            interval,
            (reachableCount.get(interval) ?? 0) + 1,
          );
          console.log(
            `    ${symbol.padEnd(9)} ${INTERVAL_CODE[r.interval].padEnd(4)} bars=${String(r.bars).padStart(4)}` +
              `  regular=${String(r.regular).padStart(4)} extended=${String(r.extended).padStart(4)}` +
              `  volumeWithheld=${String(r.volumeWithheld).padStart(4)}`,
          );
          await sleep(PER_REQUEST_DELAY_MS);
        }

        const basis = await probeBasis(symbol, releaseAt);
        if (!basis.shares) {
          basisMismatches += 1;
          console.log(
            `    ${symbol.padEnd(9)} BASIS-MISMATCH ratio=${basis.ratio?.toFixed(4)} — ` +
              `intraday and daily are on different price bases; candles from these two ` +
              `series must not be stored under one basis label`,
          );
        } else if (basis.note !== "") {
          console.log(`    ${symbol.padEnd(9)} basis: ${basis.note}`);
        }
        await sleep(PER_REQUEST_DELAY_MS);
      }
    }

    console.log("\nSummary");
    console.log(`  events probed:     ${events.length}`);
    for (const interval of flags.intervals) {
      const n = reachableCount.get(interval) ?? 0;
      console.log(
        `  ${INTERVAL_CODE[interval].padEnd(4)} reachable:    ${n}/${events.length * flags.symbols.length} event·symbol pairs`,
      );
    }
    console.log(`  basis mismatches:  ${basisMismatches}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
