/**
 * Promote release timing on already-ingested curated events.
 *
 * `ingest.ts` is create-only: it skips any seed whose headline already exists,
 * so correcting timing in `events-seed.ts` has no effect on a database that was
 * seeded before the correction. This script is the missing update path.
 *
 * It only ever copies timing that the seed itself declares. It cannot invent an
 * instant: an entry with no `releaseAt`, a `timingStatus` outside
 * VERIFIED/SCHEDULED, or a blank `timingSource` is reported as skipped and left
 * exactly as it is. The eligibility test is the same
 * `reactionTimingEligibility` the application uses, so this script cannot
 * promote a row the app would then refuse to trust.
 *
 * Usage:
 *   npm run promote:timing:dry-run
 *   TIMING_PROMOTION_CONFIRM=PROMOTE_SEED_TIMING npm run promote:timing -- --apply
 *
 * Safety:
 *   dry-run     — the default; uses the write-blocking client, so no code path
 *                 can write even by mistake.
 *   additive    — updates only the five timing columns plus a null event_key.
 *                 Never touches AssetReaction, DataRelease, headline or
 *                 occurredAt, and never creates or deletes an Event.
 *   idempotent  — re-running reports every row as already current.
 *
 * Promoting timing does NOT by itself produce reactions. Existing rows for the
 * event are legacy-version and `backfill:prices` is additive, so recomputation
 * is a deliberate second step:
 *   repair:reaction-timing --apply --event-id <id>   (clear legacy rows)
 *   backfill:prices --event-id <id>                  (write current-version rows)
 */
import "dotenv/config";

import type { PrismaClient } from "../../src/generated/prisma/client";
import { reactionTimingEligibility } from "../../src/services/events/timing";
import { createScriptPrismaClient } from "../lib/prisma";
import { createDryRunPrismaClient } from "../lib/readonly-prisma";
import { SEED_EVENTS, type SeedEvent } from "../ingest/events-seed";

const APPLY_CONFIRMATION = "PROMOTE_SEED_TIMING";

/** Mirrors `curatedEventKey` in ingest.ts — the two must agree. */
const curatedEventKey = (seed: SeedEvent): string =>
  `curated:${seed.eventType}:${seed.headline.trim().replace(/\s+/g, " ")}`;

const optionalDate = (value: string | undefined): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

interface Flags {
  apply: boolean;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { apply: false };
  for (const arg of argv) {
    if (arg === "--dry-run") flags.apply = false;
    else if (arg === "--apply") flags.apply = true;
    else if (arg === "-h" || arg === "--help") {
      console.log(
        [
          "promote-seed-timing — copy sourced seed timing onto existing events",
          "",
          "  --dry-run   preview (default)",
          "  --apply     write; requires " +
            `TIMING_PROMOTION_CONFIRM=${APPLY_CONFIRMATION}`,
        ].join("\n"),
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return flags;
}

interface Candidate {
  seed: SeedEvent;
  eventKey: string;
  releaseAt: Date;
  releaseDate: Date | null;
  timingStatus: NonNullable<SeedEvent["timingStatus"]>;
  timingSource: string;
}

/**
 * Seeds whose declared timing would satisfy the application's own eligibility
 * rule. Anything else is not a candidate — this script has no fallback clock.
 */
function candidates(): { promotable: Candidate[]; ineligible: SeedEvent[] } {
  const promotable: Candidate[] = [];
  const ineligible: SeedEvent[] = [];

  for (const seed of SEED_EVENTS) {
    const releaseAt = optionalDate(seed.releaseAt);
    const timingStatus = seed.timingStatus ?? "UNVERIFIED";
    const timingSource = seed.timingSource ?? null;
    const eligibility = reactionTimingEligibility({
      releaseAt,
      timingStatus,
      timingSource,
    });
    if (!eligibility.eligible || releaseAt === null || timingSource === null) {
      ineligible.push(seed);
      continue;
    }
    promotable.push({
      seed,
      eventKey: curatedEventKey(seed),
      releaseAt,
      releaseDate: optionalDate(seed.releaseDate),
      timingStatus,
      timingSource,
    });
  }
  return { promotable, ineligible };
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));

  if (flags.apply && process.env.TIMING_PROMOTION_CONFIRM !== APPLY_CONFIRMATION) {
    console.error(
      `Refusing apply: set TIMING_PROMOTION_CONFIRM=${APPLY_CONFIRMATION}`,
    );
    process.exitCode = 1;
    return;
  }

  const prisma: PrismaClient = flags.apply
    ? createScriptPrismaClient()
    : createDryRunPrismaClient();

  const { promotable, ineligible } = candidates();
  console.log(
    `promote-seed-timing${flags.apply ? "" : " (dry-run — no writes)"}\n` +
      `  ${promotable.length} seed entries declare sourced timing\n` +
      `  ${ineligible.length} remain unsourced and will not be touched\n`,
  );

  let updated = 0;
  let alreadyCurrent = 0;
  let missing = 0;

  try {
    for (const candidate of promotable) {
      const existing = await prisma.event.findFirst({
        where: {
          OR: [
            { eventKey: candidate.eventKey },
            { headline: candidate.seed.headline },
          ],
        },
        select: {
          id: true,
          headline: true,
          eventKey: true,
          releaseAt: true,
          timingStatus: true,
          timingSource: true,
        },
      });

      if (existing === null) {
        missing += 1;
        console.log(`  ? not in database: ${candidate.seed.headline}`);
        continue;
      }

      const current =
        existing.timingStatus === candidate.timingStatus &&
        existing.releaseAt?.getTime() === candidate.releaseAt.getTime() &&
        existing.timingSource === candidate.timingSource &&
        existing.eventKey === candidate.eventKey;

      if (current) {
        alreadyCurrent += 1;
        continue;
      }

      console.log(`  → ${existing.headline}`);
      console.log(
        `      timing  ${existing.timingStatus} → ${candidate.timingStatus}`,
      );
      console.log(
        `      instant ${existing.releaseAt?.toISOString() ?? "null"} → ${candidate.releaseAt.toISOString()}`,
      );
      console.log(`      source  ${candidate.timingSource}`);

      if (flags.apply) {
        await prisma.event.update({
          where: { id: existing.id },
          data: {
            // Only fill event_key when it is still null; never rewrite one.
            ...(existing.eventKey === null
              ? { eventKey: candidate.eventKey }
              : {}),
            releaseAt: candidate.releaseAt,
            releaseDate: candidate.releaseDate,
            timingStatus: candidate.timingStatus,
            timingSource: candidate.timingSource,
          },
        });
      }
      updated += 1;
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(
    `\n${flags.apply ? "Applied" : "Would update"}: ${updated}` +
      `  ·  already current: ${alreadyCurrent}` +
      `  ·  not found: ${missing}`,
  );
  if (updated > 0) {
    console.log(
      flags.apply
        ? "\nNext: clear legacy reaction rows for these events, then recompute:\n" +
            "  REACTION_REPAIR_CONFIRM=DELETE_UNTRUSTED_OR_LEGACY_REACTIONS \\\n" +
            "    npm run repair:reaction-timing -- --apply --event-id <id>\n" +
            "  npm run backfill:prices -- --event-id <id>"
        : `\nRe-run with TIMING_PROMOTION_CONFIRM=${APPLY_CONFIRMATION} and --apply to write.`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
