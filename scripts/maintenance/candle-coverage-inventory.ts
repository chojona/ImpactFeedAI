#!/usr/bin/env tsx
/**
 * Read-only inventory of stored candle coverage by asset, interval, and UTC day.
 *
 *   npm run inventory:candles
 *   npm run inventory:candles -- --symbol SPY --interval 1h
 *
 * Uses the write-blocking Prisma client. Never calls a market-data provider.
 * Filters to CURRENT_CANDLE_INGESTION_VERSION so stale semantics do not pollute
 * the report.
 */
import "dotenv/config";

import { createDryRunPrismaClient } from "../lib/readonly-prisma";
import {
  ALL_INTERVAL_CODES,
  CURRENT_CANDLE_INGESTION_VERSION,
  INTERVAL_CODE,
  intervalFromCode,
} from "@/services/market/candles";
import type { CandleInterval } from "@/types/market";

interface Flags {
  symbols: string[];
  intervals: CandleInterval[];
  limitDays: number | null;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    symbols: [],
    intervals: [],
    limitDays: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--symbol") {
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
      flags.intervals.push(interval);
    } else if (arg === "--limit-days") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error("--limit-days requires a positive integer");
      }
      flags.limitDays = n;
    } else if (arg === "-h" || arg === "--help") {
      console.log(`Usage: tsx scripts/maintenance/candle-coverage-inventory.ts [options]

Read-only. Reports stored bars by symbol × interval × UTC day.
No provider calls. Uses CURRENT_CANDLE_INGESTION_VERSION=${CURRENT_CANDLE_INGESTION_VERSION}.

Options:
  --symbol <TICKER>    Restrict to a symbol; may be repeated.
  --interval <CODE>    One of ${ALL_INTERVAL_CODES.join(", ")}; may be repeated.
  --limit-days <n>     Print at most n day-rows (most recent first).
  -h, --help           Show this help.`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return flags;
}

interface DayCoverageRow {
  symbol: string;
  interval: CandleInterval;
  utcDay: string;
  bars: number;
  minOpenTime: Date;
  maxOpenTime: Date;
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const prisma = createDryRunPrismaClient();

  console.log("candle-coverage-inventory (read-only — no provider calls)");
  console.log(`  ingestionVersion  ${CURRENT_CANDLE_INGESTION_VERSION}`);
  if (flags.symbols.length > 0) {
    console.log(`  symbols           ${flags.symbols.join(", ")}`);
  }
  if (flags.intervals.length > 0) {
    console.log(
      `  intervals         ${flags.intervals.map((i) => INTERVAL_CODE[i]).join(", ")}`,
    );
  }
  console.log("");

  try {
    // Day buckets are built in memory from openTime so the script stays free of
    // provider-specific SQL dialects beyond Prisma's portable reads. Prototype
    // volumes are small; revisit with a SQL date_trunc if the table grows.
    const candles = await prisma.candle.findMany({
      where: {
        ingestionVersion: CURRENT_CANDLE_INGESTION_VERSION,
        ...(flags.symbols.length > 0 ? { symbol: { in: flags.symbols } } : {}),
        ...(flags.intervals.length > 0
          ? { interval: { in: flags.intervals } }
          : {}),
      },
      select: {
        symbol: true,
        interval: true,
        openTime: true,
      },
      orderBy: [{ symbol: "asc" }, { interval: "asc" }, { openTime: "asc" }],
    });

    const buckets = new Map<string, DayCoverageRow>();

    for (const candle of candles) {
      const interval = candle.interval as CandleInterval;
      const utcDay = candle.openTime.toISOString().slice(0, 10);
      const key = `${candle.symbol}|${interval}|${utcDay}`;
      const existing = buckets.get(key);
      if (existing) {
        existing.bars += 1;
        if (candle.openTime < existing.minOpenTime) {
          existing.minOpenTime = candle.openTime;
        }
        if (candle.openTime > existing.maxOpenTime) {
          existing.maxOpenTime = candle.openTime;
        }
      } else {
        buckets.set(key, {
          symbol: candle.symbol,
          interval,
          utcDay,
          bars: 1,
          minOpenTime: candle.openTime,
          maxOpenTime: candle.openTime,
        });
      }
    }

    let dayRows = [...buckets.values()].sort((a, b) => {
      const bySymbol = a.symbol.localeCompare(b.symbol);
      if (bySymbol !== 0) return bySymbol;
      const byInterval = a.interval.localeCompare(b.interval);
      if (byInterval !== 0) return byInterval;
      return b.utcDay.localeCompare(a.utcDay);
    });

    if (flags.limitDays !== null) {
      dayRows = dayRows.slice(0, flags.limitDays);
    }

    if (dayRows.length === 0) {
      console.log("No stored candles for the current ingestion version.");
      return;
    }

    console.log(
      `${"symbol".padEnd(8)} ${"int".padEnd(4)} ${"utc_day".padEnd(10)} ${"bars".padStart(6)}  min_open_time           max_open_time`,
    );
    console.log("-".repeat(78));

    for (const row of dayRows) {
      console.log(
        `${row.symbol.padEnd(8)} ${INTERVAL_CODE[row.interval].padEnd(4)} ${row.utcDay.padEnd(10)} ${String(row.bars).padStart(6)}  ${row.minOpenTime.toISOString()}  ${row.maxOpenTime.toISOString()}`,
      );
    }

    const summary = new Map<string, { bars: number; days: number }>();
    for (const row of buckets.values()) {
      const key = `${row.symbol}|${row.interval}`;
      const current = summary.get(key) ?? { bars: 0, days: 0 };
      current.bars += row.bars;
      current.days += 1;
      summary.set(key, current);
    }

    console.log("\nSummary by symbol × interval");
    for (const [key, value] of [...summary.entries()].sort()) {
      const [symbol, interval] = key.split("|") as [string, CandleInterval];
      console.log(
        `  ${symbol.padEnd(8)} ${INTERVAL_CODE[interval].padEnd(4)}  ${String(value.bars).padStart(6)} bars across ${value.days} UTC day(s)`,
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
