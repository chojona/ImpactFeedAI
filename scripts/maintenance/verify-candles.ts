#!/usr/bin/env tsx
/**
 * Verify every invariant the candle store is supposed to hold.
 *
 * Read-only: uses the write-blocking Prisma client, so it cannot repair
 * anything it finds. That is deliberate — this is the check, not the fix.
 *
 *   npm run verify:candles
 *
 * These assertions cannot live in the unit suite: this repository's CI is
 * secret-free and has no database, so a vitest file asserting on real rows
 * would fail there. `db:verify` already draws the same line for schema-level
 * checks, and this follows it.
 *
 * Exits non-zero when any invariant fails, so it can gate a deploy.
 */
import "dotenv/config";

import { createDryRunPrismaClient } from "../lib/readonly-prisma";
import {
  CURRENT_CANDLE_INGESTION_VERSION,
  INTERVAL_CODE,
  ohlcViolations,
} from "@/services/market/candles";
import type { CandleInterval } from "@/types/market";

interface Check {
  name: string;
  detail: string;
  passed: boolean;
}

const checks: Check[] = [];
const record = (name: string, passed: boolean, detail: string): void => {
  checks.push({ name, detail, passed });
};

async function main(): Promise<void> {
  const prisma = createDryRunPrismaClient();

  try {
    const total = await prisma.candle.count();
    console.log(`candles table: ${total.toLocaleString()} rows\n`);

    if (total === 0) {
      console.log("Nothing stored yet — run `npm run backfill:candles` first.");
      return;
    }

    /* ── coverage ─────────────────────────────────────────────────────── */
    const coverage = await prisma.candle.groupBy({
      by: ["symbol", "interval", "priceBasis"],
      _count: { _all: true },
      _min: { openTime: true },
      _max: { openTime: true },
      orderBy: [{ symbol: "asc" }, { interval: "asc" }],
    });
    console.log("Coverage");
    for (const row of coverage) {
      console.log(
        `  ${row.symbol.padEnd(6)} ${INTERVAL_CODE[row.interval as CandleInterval].padEnd(4)} ` +
          `${row.priceBasis.padEnd(24)} ${String(row._count._all).padStart(5)} rows  ` +
          `${row._min.openTime?.toISOString().slice(0, 10)} → ${row._max.openTime?.toISOString().slice(0, 10)}`,
      );
    }
    console.log("");

    /* ── ingestion version ────────────────────────────────────────────── */
    const staleVersion = await prisma.candle.count({
      where: { ingestionVersion: { not: CURRENT_CANDLE_INGESTION_VERSION } },
    });
    record(
      "every row carries the current ingestion version",
      staleVersion === 0,
      `${staleVersion} row(s) on a version other than ${CURRENT_CANDLE_INGESTION_VERSION}`,
    );

    /* ── duplicates ───────────────────────────────────────────────────── */
    // The unique index makes this impossible by construction; verifying it
    // anyway is what catches an index that was never actually applied.
    const duplicates = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`
      SELECT count(*)::bigint AS n FROM (
        SELECT symbol, interval, open_time, price_basis
        FROM candles
        GROUP BY 1,2,3,4
        HAVING count(*) > 1
      ) d
    `);
    const duplicateGroups = Number(duplicates[0]?.n ?? 0);
    record(
      "no duplicate (symbol, interval, open_time, price_basis)",
      duplicateGroups === 0,
      `${duplicateGroups} duplicated key group(s)`,
    );

    /* ── declared provenance ──────────────────────────────────────────── */
    const missingProvider = await prisma.candle.count({
      where: { provider: "" },
    });
    record(
      "every row declares a provider",
      missingProvider === 0,
      `${missingProvider} row(s) with an empty provider`,
    );

    /* ── fabricated volume ────────────────────────────────────────────── */
    const extendedZeroVolume = await prisma.candle.count({
      where: { session: "EXTENDED", volume: 0 },
    });
    record(
      "no fabricated extended-hours zero volume persisted",
      extendedZeroVolume === 0,
      `${extendedZeroVolume} extended-hours row(s) stored with volume = 0`,
    );

    const withheld = await prisma.candle.count({
      where: { session: "EXTENDED", volume: null },
    });
    const extendedTotal = await prisma.candle.count({
      where: { session: "EXTENDED" },
    });
    console.log(
      `Volume: ${withheld}/${extendedTotal} extended-hours rows have NULL volume ` +
        `(withheld, not zeroed)\n`,
    );

    /* ── OHLC invariants ──────────────────────────────────────────────── */
    const incoherent = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`
      SELECT count(*)::bigint AS n FROM candles
      WHERE high < open OR high < close OR high < low
         OR low  > open OR low  > close
         OR open <= 0 OR high <= 0 OR low <= 0 OR close <= 0
    `);
    const incoherentRows = Number(incoherent[0]?.n ?? 0);
    record(
      "every stored bar satisfies the OHLC invariants",
      incoherentRows === 0,
      `${incoherentRows} incoherent bar(s)`,
    );

    // Cross-check the SQL predicate against the TypeScript one on a sample, so
    // the two definitions of "coherent" cannot drift apart unnoticed.
    const sample = await prisma.candle.findMany({
      take: 500,
      orderBy: { openTime: "asc" },
      select: { open: true, high: true, low: true, close: true },
    });
    const tsViolations = sample.filter(
      (row) => ohlcViolations(row).length > 0,
    ).length;
    record(
      "SQL and TypeScript agree on OHLC coherence",
      tsViolations === 0,
      `${tsViolations} of ${sample.length} sampled rows failed the TS check`,
    );

    /* ── ordering and plausibility ────────────────────────────────────── */
    const outOfOrder = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`
      SELECT count(*)::bigint AS n FROM (
        SELECT open_time,
               lag(open_time) OVER (
                 PARTITION BY symbol, interval, price_basis ORDER BY open_time
               ) AS prev
        FROM candles
      ) s WHERE prev IS NOT NULL AND open_time <= prev
    `);
    const outOfOrderRows = Number(outOfOrder[0]?.n ?? 0);
    record(
      "timestamps are strictly increasing within each series",
      outOfOrderRows === 0,
      `${outOfOrderRows} non-increasing timestamp(s)`,
    );

    const bounds = await prisma.candle.aggregate({
      _min: { openTime: true },
      _max: { openTime: true },
    });
    const newest = bounds._max.openTime;
    const plausible = newest !== null && newest.getTime() <= Date.now();
    record(
      "no candle is stamped in the future",
      plausible,
      `newest bar ${newest?.toISOString()}`,
    );

    /* ── session classification ───────────────────────────────────────── */
    const sessions = await prisma.candle.groupBy({
      by: ["session"],
      _count: { _all: true },
    });
    const sessionSummary = sessions
      .map((s) => `${s.session}=${s._count._all}`)
      .join(" ");
    record(
      "every row is classified into a session",
      sessions.reduce((acc, s) => acc + s._count._all, 0) === total,
      sessionSummary,
    );

    /* ── one basis per series ─────────────────────────────────────────── */
    const mixedBasis = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`
      SELECT count(*)::bigint AS n FROM (
        SELECT symbol, interval FROM candles
        GROUP BY 1,2 HAVING count(DISTINCT price_basis) > 1
      ) m
    `);
    const mixedSeries = Number(mixedBasis[0]?.n ?? 0);
    record(
      "no symbol/interval series mixes price bases",
      mixedSeries === 0,
      `${mixedSeries} series holding more than one basis`,
    );

    /* ── report ───────────────────────────────────────────────────────── */
    console.log("Invariants");
    let failed = 0;
    for (const check of checks) {
      const mark = check.passed ? "✓" : "✗";
      if (!check.passed) failed += 1;
      console.log(`  ${mark} ${check.name}`);
      if (!check.passed || check.detail.includes("=")) {
        console.log(`      ${check.detail}`);
      }
    }

    console.log(
      `\n${checks.length - failed}/${checks.length} invariants hold.`,
    );
    if (failed > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
