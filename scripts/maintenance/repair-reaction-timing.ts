#!/usr/bin/env tsx
/**
 * Remove reaction rows that cannot be defended under the timing-provenance
 * model. This script never changes Event or DataRelease rows.
 *
 * Default mode is dry-run. Applying is deliberately cumbersome:
 *
 *   npm run repair:reaction-timing:dry-run
 *   REACTION_REPAIR_CONFIRM=DELETE_UNTRUSTED_OR_LEGACY_REACTIONS \
 *     npm run repair:reaction-timing -- --apply --all
 *
 * A current reaction must satisfy both conditions:
 *   1. the event has reaction-eligible release timing; and
 *   2. AssetReaction.calculationVersion matches the current implementation.
 *
 * Rows on trusted events are deleted here and can then be recomputed with a
 * matching `backfill:prices -- --event-id ...` scope; rows on untrusted events
 * remain absent until an authoritative release timestamp is added. Both
 * stages are idempotent.
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../src/generated/prisma/client";
import { guardPrismaClient } from "../lib/readonly-prisma";
import {
  CURRENT_REACTION_CALCULATION_VERSION,
} from "@/services/events/timing";
import { planReactionRepair } from "@/services/events/reactionRepair";

const APPLY_CONFIRMATION = "DELETE_UNTRUSTED_OR_LEGACY_REACTIONS";

interface Flags {
  apply: boolean;
  all: boolean;
  eventIds: string[];
  limit: number | null;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { apply: false, all: false, eventIds: [], limit: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") flags.apply = false;
    else if (arg === "--apply") flags.apply = true;
    else if (arg === "--all") flags.all = true;
    else if (arg === "--event-id") {
      const id = argv[++i];
      if (!id) throw new Error("--event-id requires a value");
      flags.eventIds.push(id);
    } else if (arg === "--limit") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error("--limit requires a positive integer");
      }
      flags.limit = n;
    } else if (arg === "-h" || arg === "--help") {
      console.log(`Usage: tsx scripts/maintenance/repair-reaction-timing.ts [options]

Options:
  --dry-run           Report only (default).
  --apply             Delete the reported rows; requires confirmation env.
  --all               Required with --apply unless --event-id is supplied.
  --event-id <uuid>   Scope to one event; may be repeated.
  --limit <n>         Inspect at most n events (dry-run only).
  -h, --help          Show this help.`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (flags.apply && flags.limit !== null) {
    throw new Error("--limit is preview-only; scope apply with --event-id or --all");
  }
  if (flags.apply && !flags.all && flags.eventIds.length === 0) {
    throw new Error("--apply requires an explicit --all or at least one --event-id");
  }
  return flags;
}

function requireDirectUrl(apply: boolean): string {
  const url = process.env.DIRECT_URL;
  if (!url) {
    throw new Error(
      "DIRECT_URL is required. This repair refuses the pooled DATABASE_URL fallback.",
    );
  }
  if (apply && process.env.REACTION_REPAIR_CONFIRM !== APPLY_CONFIRMATION) {
    throw new Error(
      `Refusing apply: set REACTION_REPAIR_CONFIRM=${APPLY_CONFIRMATION}`,
    );
  }
  return url;
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const directUrl = requireDirectUrl(flags.apply);
  const base = new PrismaClient({
    adapter: new PrismaPg({ connectionString: directUrl }),
  });
  const prisma = flags.apply ? base : guardPrismaClient(base);

  console.log(
    `repair-reaction-timing (${flags.apply ? "APPLY" : "dry-run — no writes"})`,
  );
  console.log(
    `current calculation version=${CURRENT_REACTION_CALCULATION_VERSION}\n`,
  );

  try {
    const events = await prisma.event.findMany({
      where: {
        ...(flags.eventIds.length > 0 ? { id: { in: flags.eventIds } } : {}),
        assetReactions: { some: {} },
      },
      select: {
        id: true,
        headline: true,
        releaseAt: true,
        timingStatus: true,
        timingSource: true,
        assetReactions: {
          select: {
            id: true,
            assetSymbol: true,
            calculationVersion: true,
          },
          orderBy: { assetSymbol: "asc" },
        },
      },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      ...(flags.limit === null ? {} : { take: flags.limit }),
    });

    let eventsAffected = 0;
    let rowsAffected = 0;
    let recomputableEvents = 0;

    for (const event of events) {
      const plan = planReactionRepair({
        releaseAt: event.releaseAt,
        timingStatus: event.timingStatus,
        timingSource: event.timingSource,
        reactions: event.assetReactions,
      });
      const affected = plan.deleteRows;
      if (affected.length === 0) continue;

      eventsAffected += 1;
      rowsAffected += affected.length;
      if (plan.recomputeAfterDelete) recomputableEvents += 1;
      const reason = plan.timingEligible
        ? "legacy calculation version"
        : `timing not reaction-eligible (${event.timingStatus})`;
      const next = plan.recomputeAfterDelete
        ? `delete; then recompute with backfill:prices -- --event-id ${event.id}`
        : "delete; do not recompute until timing is verified";

      console.log(`${event.id}  ${event.headline}`);
      console.log(`  reason: ${reason}`);
      console.log(`  action: ${next}`);
      console.log(
        `  rows (${affected.length}): ${affected.map((r) => `${r.assetSymbol}[v${r.calculationVersion ?? "legacy"}]`).join(", ")}`,
      );

      if (flags.apply) {
        const result = await prisma.assetReaction.deleteMany({
          where: { id: { in: affected.map((row) => row.id) } },
        });
        console.log(`  applied: deleted ${result.count}\n`);
      } else {
        console.log("");
      }
    }

    console.log("──────────────────────────────────────────────────────────");
    console.log(`events inspected        ${events.length}`);
    console.log(`events affected         ${eventsAffected}`);
    console.log(`reaction rows affected  ${rowsAffected}`);
    console.log(`events recomputable     ${recomputableEvents}`);
    console.log("──────────────────────────────────────────────────────────");
    if (!flags.apply) {
      console.log("Dry-run complete. Nothing was written.");
    } else if (recomputableEvents > 0) {
      console.log(
        "Apply complete. Review the event-scoped backfill commands above before recomputing trusted events.",
      );
    } else {
      console.log("Apply complete. No trusted event is queued for recomputation.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Fatal:", error instanceof Error ? error.message : error);
  process.exit(1);
});
