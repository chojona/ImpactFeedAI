#!/usr/bin/env tsx
/**
 * Quick verification: counts rows in events / asset_reactions / data_releases
 * and groups events by type. Equivalent to:
 *   SELECT COUNT(*) FROM events;
 *   SELECT event_type, COUNT(*) FROM events GROUP BY event_type;
 *
 * Run: npm run db:verify   (or: npx tsx scripts/maintenance/verify-db.ts)
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const [eventCount, assetCount, macroCount] = await Promise.all([
      prisma.event.count(),
      prisma.assetReaction.count(),
      prisma.dataRelease.count(),
    ]);

    const byType = await prisma.event.groupBy({
      by: ["eventType"],
      _count: { _all: true },
      orderBy: { eventType: "asc" },
    });

    console.log("=== Row counts ===");
    console.log(`events:           ${eventCount}`);
    console.log(`asset_reactions:  ${assetCount}`);
    console.log(`data_releases:    ${macroCount}`);
    console.log("");
    console.log("=== Events by type ===");
    for (const row of byType) {
      console.log(
        `${row.eventType.padEnd(20)} ${String(row._count._all).padStart(3)}`,
      );
    }

    // Sanity check on per-event asset distribution
    const partial = await prisma.event.findMany({
      where: { assetReactions: { some: {} } },
      select: {
        id: true,
        headline: true,
        _count: { select: { assetReactions: true } },
      },
    });
    const incomplete = partial.filter((e) => e._count.assetReactions < 12);
    console.log("");
    console.log(
      `=== Coverage: ${partial.length}/${eventCount} events have asset rows ===`,
    );
    if (incomplete.length > 0) {
      console.log(
        `${incomplete.length} event(s) with <12 asset rows (best-effort partials):`,
      );
      for (const e of incomplete) {
        console.log(
          `  - ${e._count.assetReactions}/12  ${e.headline.slice(0, 70)}`,
        );
      }
    } else {
      console.log("All events have a full 12-asset row set.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("verify failed:", err);
  process.exit(1);
});