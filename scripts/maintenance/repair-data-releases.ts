#!/usr/bin/env tsx
/**
 * Recalculate existing curated `DataRelease` rows using the canonical metric
 * system in `src/services/macro/metrics.ts`.
 *
 *   npm run repair:data-releases:dry-run      # full diff, writes nothing
 *   npm run repair:data-releases              # apply
 *   npm run repair:data-releases -- --limit 3 # apply to the first 3 only
 *
 * Scope — deliberately narrow. Only these four fields are ever written:
 *
 *     metricName · actualValue · priorValue · surpriseMagnitude
 *
 * Never touched: DataRelease.id, DataRelease.eventId, DataRelease.expectedValue
 * (that comes from the curated seed and is the human's input, not ours), and
 * every Event / AssetReaction row.
 *
 * No row is ever created or deleted. Each row is updated on its own so a
 * failure part-way through leaves a consistent database, and the run halts
 * rather than retrying.
 *
 * Dry-run uses the enforced read-only client, so it is structurally incapable
 * of writing — see scripts/lib/readonly-prisma.ts.
 */
import "dotenv/config";

import { SEED_EVENTS } from "../ingest/events-seed";
import { fetchMacroRelease } from "../ingest/fetch-macro";
import {
  CURATED_SERIES_BY_EVENT_TYPE,
  type CanonicalMetric,
  type MetricUnit,
} from "@/services/macro/metrics";
import { createScriptPrismaClient } from "../lib/prisma";
import { createDryRunPrismaClient } from "../lib/readonly-prisma";

interface Flags {
  dryRun: boolean;
  limit: number | null;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { dryRun: false, limit: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--limit") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n <= 0) {
        console.error("--limit requires a positive integer");
        process.exit(2);
      }
      flags.limit = n;
    } else if (arg === "-h" || arg === "--help") {
      console.log(`Usage: tsx scripts/maintenance/repair-data-releases.ts [options]

Options:
  --dry-run     Report the full diff; write nothing.
  --limit <n>   Process at most n rows.
  -h, --help    Show this help.`);
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return flags;
}

/** Plausible range for a value in a given canonical unit. */
const PLAUSIBLE: Record<MetricUnit, [number, number]> = {
  pct_yoy: [-30, 30],
  pct_saar: [-40, 40],
  pct_level: [0, 25],
  thousands_mom: [-25000, 5000],
  index_points: [0, 200],
};

type Classification =
  | "numeric correction"
  | "metric-name-only correction"
  | "unchanged"
  | "unable to derive";

interface Row {
  releaseId: string;
  eventId: string;
  headline: string;
  eventType: string;
  metric: CanonicalMetric;
  old: {
    metricName: string;
    actualValue: number | null;
    priorValue: number | null;
    surpriseMagnitude: number | null;
    expectedValue: number | null;
  };
  next: {
    metricName: string;
    actualValue: number | null;
    priorValue: number | null;
    surpriseMagnitude: number | null;
    expectedValue: number | null;
  } | null;
  classification: Classification;
  problems: string[];
}

const fmt = (v: number | null): string => (v === null ? "null" : String(v));
const arrow = (a: number | null, b: number | null): string =>
  `${fmt(a)} → ${fmt(b)}`;

/** Economic sanity checks. Anything pushed here blocks the write. */
function validate(row: Row): string[] {
  const problems: string[] = [];
  if (!row.next) return ["could not derive a corrected release"];
  const { actualValue, priorValue, surpriseMagnitude, expectedValue } = row.next;
  const unit = row.metric.unit;

  if (actualValue === null) {
    problems.push("actualValue is null after recalculation");
    return problems;
  }

  // Plausible magnitude for the unit.
  const [lo, hi] = PLAUSIBLE[unit];
  if (actualValue < lo || actualValue > hi) {
    problems.push(
      `actualValue ${actualValue} outside plausible ${unit} range [${lo}, ${hi}]`,
    );
  }
  if (priorValue !== null && (priorValue < lo || priorValue > hi)) {
    problems.push(
      `priorValue ${priorValue} outside plausible ${unit} range [${lo}, ${hi}]`,
    );
  }

  if (expectedValue !== null) {
    // Dimensional compatibility: same order of magnitude as the consensus.
    const ratio = Math.abs(actualValue) / Math.max(Math.abs(expectedValue), 0.01);
    if (ratio > 20 || ratio < 0.05) {
      problems.push(
        `unit mismatch: |actual/expected| = ${ratio.toFixed(2)} (expected 0.05–20)`,
      );
    }
    // surprise must be exactly actual − expected in the canonical unit.
    const want = Math.round((actualValue - expectedValue) * 1e4) / 1e4;
    if (surpriseMagnitude === null || Math.abs(surpriseMagnitude - want) > 1e-9) {
      problems.push(
        `surprise ${fmt(surpriseMagnitude)} ≠ actual − expected (${want})`,
      );
    }
  } else if (surpriseMagnitude !== null) {
    problems.push("surprise is non-null but there is no expectedValue");
  }

  // Fed-specific semantics.
  if (row.metric.key === "FED_TARGET_UPPER") {
    if (priorValue === null) {
      problems.push("Fed decision has no priorValue (pre-decision rate)");
    } else {
      const move = Math.round((actualValue - priorValue) * 100);
      if (move % 25 !== 0) {
        problems.push(
          `Fed move of ${move}bp is not a multiple of 25bp (prior ${priorValue} → actual ${actualValue})`,
        );
      }
      if (Math.abs(move) > 100) {
        problems.push(`Fed move of ${move}bp is implausibly large`);
      }
    }
  }

  // expectedValue must be carried through untouched.
  if (expectedValue !== row.old.expectedValue) {
    problems.push(
      `expectedValue would change (${fmt(row.old.expectedValue)} → ${fmt(expectedValue)}) — not permitted`,
    );
  }

  return problems;
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const prisma = flags.dryRun
    ? createDryRunPrismaClient()
    : createScriptPrismaClient();

  console.log(
    `repair-data-releases${flags.dryRun ? " (dry-run — no writes)" : " (APPLYING)"}` +
      `${flags.limit !== null ? ` limit=${flags.limit}` : ""}\n`,
  );

  const rows: Row[] = [];

  try {
    for (const seed of SEED_EVENTS) {
      const binding =
        CURATED_SERIES_BY_EVENT_TYPE[
          seed.eventType as keyof typeof CURATED_SERIES_BY_EVENT_TYPE
        ];
      if (!binding) continue; // no canonical series → never produced a release

      const occurredAt = new Date(seed.occurredAt);
      const event = await prisma.event.findUnique({
        where: { event_natural_key: { headline: seed.headline, occurredAt } },
        select: { id: true, eventType: true, dataReleases: true },
      });
      if (!event || event.dataReleases.length === 0) continue;

      for (const release of event.dataReleases) {
        const fixed = await fetchMacroRelease({
          eventType: seed.eventType,
          occurredAt,
          expectedValue: seed.expectedValue ?? null,
          metricNameOverride: null,
        });

        const row: Row = {
          releaseId: release.id,
          eventId: event.id,
          headline: seed.headline,
          eventType: event.eventType,
          metric: binding.metric,
          old: {
            metricName: release.metricName,
            actualValue: release.actualValue,
            priorValue: release.priorValue,
            surpriseMagnitude: release.surpriseMagnitude,
            expectedValue: release.expectedValue,
          },
          next: fixed
            ? {
                metricName: fixed.metricName,
                actualValue: fixed.actualValue,
                priorValue: fixed.priorValue,
                surpriseMagnitude: fixed.surpriseMagnitude,
                expectedValue: fixed.expectedValue,
              }
            : null,
          classification: "unable to derive",
          problems: [],
        };

        if (row.next) {
          const numericChanged =
            row.next.actualValue !== row.old.actualValue ||
            row.next.priorValue !== row.old.priorValue ||
            row.next.surpriseMagnitude !== row.old.surpriseMagnitude;
          const nameChanged = row.next.metricName !== row.old.metricName;
          row.classification = numericChanged
            ? "numeric correction"
            : nameChanged
              ? "metric-name-only correction"
              : "unchanged";
        }
        row.problems = validate(row);
        rows.push(row);
      }
    }

    const queue = flags.limit === null ? rows : rows.slice(0, flags.limit);

    /* ── report ─────────────────────────────────────────────────────── */
    let i = 0;
    for (const row of queue) {
      i += 1;
      console.log(`[${String(i).padStart(2)}] ${row.headline}`);
      console.log(`     type          ${row.eventType}   unit ${row.metric.unitLabel}`);
      console.log(`     metricName    ${row.old.metricName} → ${row.next?.metricName ?? "—"}`);
      console.log(`     expectedValue ${fmt(row.old.expectedValue)}  (unchanged)`);
      console.log(`     actualValue   ${arrow(row.old.actualValue, row.next?.actualValue ?? null)}`);
      console.log(`     priorValue    ${arrow(row.old.priorValue, row.next?.priorValue ?? null)}`);
      console.log(`     surprise      ${arrow(row.old.surpriseMagnitude, row.next?.surpriseMagnitude ?? null)}`);
      console.log(`     class         ${row.classification}`);
      if (row.problems.length > 0) {
        for (const p of row.problems) console.log(`     ✗ ${p}`);
      } else {
        console.log(`     ✓ validation passed`);
      }
      console.log("");
    }

    const counts: Record<Classification, number> = {
      "numeric correction": 0,
      "metric-name-only correction": 0,
      unchanged: 0,
      "unable to derive": 0,
    };
    for (const r of queue) counts[r.classification] += 1;
    const invalid = queue.filter((r) => r.problems.length > 0);

    console.log("──────────────────────────────────────────────────────────");
    console.log(`total rows                  ${queue.length}`);
    console.log(`numeric corrections         ${counts["numeric correction"]}`);
    console.log(`metric-name-only            ${counts["metric-name-only correction"]}`);
    console.log(`unchanged                   ${counts.unchanged}`);
    console.log(`unable to derive            ${counts["unable to derive"]}`);
    console.log(`rows failing validation     ${invalid.length}`);
    console.log("──────────────────────────────────────────────────────────\n");

    if (invalid.length > 0) {
      console.error(
        `✗ ${invalid.length} row(s) failed economic validation. Refusing to write.`,
      );
      process.exit(1);
    }

    const toWrite = queue.filter(
      (r) =>
        r.classification === "numeric correction" ||
        r.classification === "metric-name-only correction",
    );

    if (flags.dryRun) {
      console.log(
        toWrite.length === 0
          ? "Dry-run: 0 rows require changes. ✓"
          : `Dry-run: ${toWrite.length} row(s) would be updated. Nothing was written.`,
      );
      return;
    }

    if (toWrite.length === 0) {
      console.log("Nothing to repair. ✓");
      return;
    }

    /* ── apply ──────────────────────────────────────────────────────── */
    const completed: string[] = [];
    for (const row of toWrite) {
      if (!row.next) continue;
      try {
        await prisma.dataRelease.update({
          where: { id: row.releaseId },
          data: {
            metricName: row.next.metricName,
            actualValue: row.next.actualValue,
            priorValue: row.next.priorValue,
            surpriseMagnitude: row.next.surpriseMagnitude,
          },
        });
        completed.push(row.releaseId);
        console.log(`✓ repaired: ${row.headline.slice(0, 64)}`);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.error(`\n✗ FAILED on: ${row.headline}`);
        console.error(`  ${detail}`);
        console.error(
          `\nHALTING — no further writes will be attempted (no blind retry).`,
        );
        console.error(`  completed: ${completed.length}/${toWrite.length}`);
        console.error(`  remaining: ${toWrite.length - completed.length}`);
        process.exit(1);
      }
    }

    console.log(`\nRepaired ${completed.length}/${toWrite.length} row(s). ✓`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
