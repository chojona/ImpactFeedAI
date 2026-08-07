#!/usr/bin/env tsx
/**
 * Proves the dry-run client can read Neon but cannot write to it.
 *
 *   npm run smoke:dryrun
 *
 * Every write attempt below is expected to throw *before* reaching the
 * database, so running this leaves no trace. Reads are expected to succeed —
 * that is the whole point: a dry-run must be able to evaluate deduplication.
 */
import "dotenv/config";

import { createDryRunPrismaClient, DryRunWriteError } from "../lib/readonly-prisma";

interface Check {
  label: string;
  run: () => Promise<unknown>;
  expect: "blocked" | "allowed";
}

async function main(): Promise<void> {
  const prisma = createDryRunPrismaClient();
  let failures = 0;

  const checks: Check[] = [
    // ── reads must work ──────────────────────────────────────────────────
    { label: "event.count()", expect: "allowed", run: () => prisma.event.count() },
    {
      label: "assetReaction.count()",
      expect: "allowed",
      run: () => prisma.assetReaction.count(),
    },
    {
      label: "dataRelease.count()",
      expect: "allowed",
      run: () => prisma.dataRelease.count(),
    },
    {
      label: "event.findFirst() [the dedup query]",
      expect: "allowed",
      run: () =>
        prisma.event.findFirst({
          where: { eventType: "CPI" },
          select: { id: true },
        }),
    },
    // ── writes must be blocked ───────────────────────────────────────────
    {
      label: "event.create()",
      expect: "blocked",
      run: () =>
        prisma.event.create({
          data: {
            headline: "SMOKE TEST — MUST NEVER BE INSERTED",
            eventType: "MACRO_DATA",
            occurredAt: new Date("1970-01-01T00:00:00Z"),
          },
        }),
    },
    {
      label: "assetReaction.createMany()",
      expect: "blocked",
      run: () =>
        prisma.assetReaction.createMany({
          data: [
            {
              eventId: "00000000-0000-0000-0000-000000000000",
              assetSymbol: "SMOKE",
              priceAtEvent: 1,
            },
          ],
        }),
    },
    {
      label: "event.updateMany()",
      expect: "blocked",
      run: () =>
        prisma.event.updateMany({
          where: { headline: "does-not-exist" },
          data: { explanation: "should never be written" },
        }),
    },
    {
      label: "dataRelease.deleteMany()",
      expect: "blocked",
      run: () => prisma.dataRelease.deleteMany({ where: { metricName: "nope" } }),
    },
    {
      label: "event.upsert()",
      expect: "blocked",
      run: () =>
        prisma.event.upsert({
          where: {
            event_natural_key: {
              headline: "does-not-exist",
              occurredAt: new Date("1970-01-01T00:00:00Z"),
            },
          },
          create: {
            headline: "does-not-exist",
            eventType: "MACRO_DATA",
            occurredAt: new Date("1970-01-01T00:00:00Z"),
          },
          update: {},
        }),
    },
    {
      label: "create() inside $transaction()",
      expect: "blocked",
      run: () =>
        prisma.$transaction(async (tx) =>
          tx.event.create({
            data: {
              headline: "SMOKE TEST — TX — MUST NEVER BE INSERTED",
              eventType: "MACRO_DATA",
              occurredAt: new Date("1970-01-01T00:00:00Z"),
            },
          }),
        ),
    },
  ];

  const before = await prisma.event.count();

  for (const check of checks) {
    let outcome: "allowed" | "blocked";
    let detail = "";
    try {
      await check.run();
      outcome = "allowed";
    } catch (err) {
      outcome = err instanceof DryRunWriteError ? "blocked" : "allowed";
      if (!(err instanceof DryRunWriteError)) {
        detail = ` (threw a non-guard error: ${err instanceof Error ? err.message.slice(0, 70) : String(err)})`;
        outcome = "allowed"; // not blocked *by the guard* — treat as failure below
      }
    }
    const ok = outcome === check.expect;
    if (!ok) failures += 1;
    console.log(
      `   ${ok ? "✓" : "✗"} ${check.label.padEnd(38)} expected ${check.expect}, got ${outcome}${detail}`,
    );
  }

  const after = await prisma.event.count();
  console.log(`\n   event count before=${before} after=${after}`);
  if (before !== after) {
    console.log("   ✗ ROW COUNT CHANGED — the guard leaked a write!");
    failures += 1;
  } else {
    console.log("   ✓ row count unchanged — nothing was written");
  }

  await prisma.$disconnect();

  console.log(
    failures === 0
      ? "\nDry-run guard holds: reads allowed, every write blocked. ✓"
      : `\n${failures} guard check(s) failed. ✗`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
