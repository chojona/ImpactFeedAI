#!/usr/bin/env tsx
/**
 * Verify every invariant in
 * docs/superpowers/specs/2026-09-12-reaction-measurement-contract-design.md
 * §6 against the current-version `reaction_measurements` rows.
 *
 *   npm run verify:reaction-measurements
 *
 * Read-only — uses the dry-run-guarded client. Exits non-zero on any
 * violation.
 *
 * The universal invariant `anchorAt < releaseAt < endpointAt` proposed
 * elsewhere is INVALID for the session family (spec §6.2): Yahoo stamps a
 * daily bar at the session OPEN, so a release-session endpoint bar is often
 * stamped before the release even though the endpoint PRICE is that
 * session's close. `checkInvariants` therefore branches by measure family —
 * instant ordering only for `INTRADAY_60M`; session ordering (adjacency and
 * offset, resolved against the actual canonical calendar) for the session
 * family.
 */
import "dotenv/config";

import { createDryRunPrismaClient } from "../lib/readonly-prisma";
import { createYahooMeasurementProvider } from "../ingest/measurement-provider";
import {
  measureFamily,
  sessionOffsetFor,
  type ReactionMeasure,
} from "@/services/events/reactionMeasures";
import { CURRENT_REACTION_CALCULATION_VERSION } from "@/services/events/timing";
import type { PriceBasis } from "@/types/market";

/* ─────────────────────── pure invariant checker (tested) ────────────────── */

export interface VerifiableMeasurementRow {
  measure: ReactionMeasure;
  anchorKind: "PRE_RELEASE_INTRADAY_BAR" | "PRIOR_SESSION_CLOSE";
  anchorPrice: number;
  anchorBarAt: Date;
  /** Canonical session day, YYYY-MM-DD. */
  anchorSessionDay: string;
  endpointPrice: number;
  endpointBarAt: Date;
  endpointSessionDay: string;
  releaseSessionDay: string;
  pctChange: number;
  priceBasis: PriceBasis;
  sessionBasis: string;
}

export interface InvariantContext {
  releaseAt: Date;
  /** The canonical calendar's session days, in order, covering this row. */
  sessionDays: readonly string[];
}

export type InvariantViolation =
  | "non_positive_price"
  | "non_canonical_session_day"
  | "pct_change_inconsistent"
  | "anchor_kind_family_mismatch"
  | "anchor_session_not_adjacent"
  | "endpoint_session_offset_mismatch"
  | "intraday_anchor_not_pre_release";

const PCT_TOLERANCE = 1e-6;

/**
 * Every invariant a stored row must satisfy, branched by measure family per
 * spec §6.2. Never combines the two families' rules into one shared check —
 * a rule that is valid for one family and invalid for the other must be
 * represented explicitly rather than loosened until both pass.
 */
export function checkInvariants(
  row: VerifiableMeasurementRow,
  ctx: InvariantContext,
): InvariantViolation[] {
  const violations: InvariantViolation[] = [];

  // ── universal (§6.1) ─────────────────────────────────────────────────
  if (
    !Number.isFinite(row.anchorPrice) ||
    row.anchorPrice <= 0 ||
    !Number.isFinite(row.endpointPrice) ||
    row.endpointPrice <= 0
  ) {
    violations.push("non_positive_price");
  }

  const dayIndex = new Map(ctx.sessionDays.map((day, i) => [day, i]));
  const anchorIdx = dayIndex.get(row.anchorSessionDay);
  const endpointIdx = dayIndex.get(row.endpointSessionDay);
  const releaseIdx = dayIndex.get(row.releaseSessionDay);
  if (anchorIdx === undefined || endpointIdx === undefined || releaseIdx === undefined) {
    violations.push("non_canonical_session_day");
  }

  if (Number.isFinite(row.anchorPrice) && row.anchorPrice > 0) {
    const expected = ((row.endpointPrice - row.anchorPrice) / row.anchorPrice) * 100;
    if (
      !Number.isFinite(row.pctChange) ||
      Math.abs(row.pctChange - expected) > Math.max(PCT_TOLERANCE, Math.abs(expected) * 1e-9)
    ) {
      violations.push("pct_change_inconsistent");
    }
  }

  const family = measureFamily(row.measure);
  const expectedAnchorKind =
    family === "SESSION" ? "PRIOR_SESSION_CLOSE" : "PRE_RELEASE_INTRADAY_BAR";
  if (row.anchorKind !== expectedAnchorKind) {
    violations.push("anchor_kind_family_mismatch");
  }

  // ── family-branched (§6.2) ───────────────────────────────────────────
  if (family === "SESSION") {
    if (
      anchorIdx !== undefined &&
      releaseIdx !== undefined &&
      anchorIdx !== releaseIdx - 1
    ) {
      violations.push("anchor_session_not_adjacent");
    }
    const offset = sessionOffsetFor(row.measure);
    if (
      offset !== null &&
      endpointIdx !== undefined &&
      releaseIdx !== undefined &&
      endpointIdx !== releaseIdx + offset
    ) {
      violations.push("endpoint_session_offset_mismatch");
    }
  } else {
    // INTRADAY_60M: instant ordering against releaseAt is meaningful (the
    // session family's bar stamps are not, per the module doc comment).
    if (row.anchorBarAt.getTime() >= ctx.releaseAt.getTime()) {
      violations.push("intraday_anchor_not_pre_release");
    }
  }

  return violations;
}

/* ────────────────────────────────── CLI ──────────────────────────────── */

async function main(): Promise<void> {
  const prisma = createDryRunPrismaClient();
  const provider = createYahooMeasurementProvider();

  console.log(`verify-reaction-measurements — version ${CURRENT_REACTION_CALCULATION_VERSION}\n`);

  try {
    const rows = await prisma.reactionMeasurement.findMany({
      where: { calculationVersion: CURRENT_REACTION_CALCULATION_VERSION },
      include: { event: { select: { id: true, releaseAt: true } } },
      orderBy: [{ eventId: "asc" }, { symbol: "asc" }, { measure: "asc" }],
    });

    if (rows.length === 0) {
      console.log("No current-version rows to verify.");
      return;
    }

    const byEvent = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = byEvent.get(row.eventId) ?? [];
      list.push(row);
      byEvent.set(row.eventId, list);
    }

    let violationCount = 0;
    const rowsByMeasure = new Map<string, number>();
    const rowsBySessionBasis = new Map<string, number>();
    const anchorKindsByMeasure = new Map<string, Set<string>>();
    const sessionBasisBySymbol = new Map<string, Set<string>>();
    const intradayElapsedMinutes: number[] = [];
    const releaseSessionDaysByVersion = new Set<string>();

    for (const [eventId, eventRows] of byEvent) {
      const releaseAt = eventRows[0].event.releaseAt;
      if (releaseAt === null) {
        console.log(`  ${eventId}  SKIPPED — no releaseAt on the event row`);
        continue;
      }

      // Re-derive the canonical calendar independently from the write path,
      // by re-fetching SPY's own daily series for this event. This is what
      // catches a stale, corrupted or drifted calendar rather than merely
      // re-checking a row's internal self-consistency.
      const spySeries = await provider.fetchSeries({ symbol: "SPY", releaseAt });
      if (spySeries.status === "failed") {
        console.log(`  ${eventId}  SKIPPED — reference calendar unavailable: ${spySeries.reason}`);
        continue;
      }
      const sessionDays = spySeries.series.daily.map((bar) => bar.sessionDay);
      const ctx: InvariantContext = { releaseAt, sessionDays };

      for (const row of eventRows) {
        rowsByMeasure.set(row.measure, (rowsByMeasure.get(row.measure) ?? 0) + 1);
        rowsBySessionBasis.set(
          row.sessionBasis,
          (rowsBySessionBasis.get(row.sessionBasis) ?? 0) + 1,
        );

        const kinds = anchorKindsByMeasure.get(row.measure) ?? new Set();
        kinds.add(row.anchorKind);
        anchorKindsByMeasure.set(row.measure, kinds);

        const bases = sessionBasisBySymbol.get(row.symbol) ?? new Set();
        bases.add(row.sessionBasis);
        sessionBasisBySymbol.set(row.symbol, bases);

        releaseSessionDaysByVersion.add(row.releaseSessionDay.toISOString().slice(0, 10));

        if (row.measure === "INTRADAY_60M") {
          intradayElapsedMinutes.push(
            (row.endpointBarAt.getTime() - releaseAt.getTime()) / 60_000,
          );
        }

        const verifiable: VerifiableMeasurementRow = {
          measure: row.measure as ReactionMeasure,
          anchorKind: row.anchorKind,
          anchorPrice: row.anchorPrice,
          anchorBarAt: row.anchorBarAt,
          anchorSessionDay: row.anchorSessionDay.toISOString().slice(0, 10),
          endpointPrice: row.endpointPrice,
          endpointBarAt: row.endpointBarAt,
          endpointSessionDay: row.endpointSessionDay.toISOString().slice(0, 10),
          releaseSessionDay: row.releaseSessionDay.toISOString().slice(0, 10),
          pctChange: row.pctChange,
          priceBasis: row.priceBasis,
          sessionBasis: row.sessionBasis,
        };

        const violations = checkInvariants(verifiable, ctx);
        if (violations.length > 0) {
          violationCount += violations.length;
          console.log(
            `  ✗ ${row.eventId} ${row.symbol} ${row.measure}: ${violations.join(", ")}`,
          );
        }
      }
    }

    console.log("\n=== Coverage ===");
    console.log("rows by measure:");
    for (const [measure, n] of rowsByMeasure) console.log(`  ${measure.padEnd(20)} ${n}`);
    console.log("rows by sessionBasis:");
    for (const [basis, n] of rowsBySessionBasis) console.log(`  ${basis.padEnd(20)} ${n}`);

    console.log("\n=== Anchor-kind purity (must be exactly 1 per measure) ===");
    for (const [measure, kinds] of anchorKindsByMeasure) {
      const ok = kinds.size === 1 ? "✓" : "✗";
      console.log(`  ${ok} ${measure.padEnd(20)} {${[...kinds].join(", ")}}`);
      if (kinds.size !== 1) violationCount += 1;
    }

    console.log("\n=== Session-basis stability (must be exactly 1 per symbol) ===");
    for (const [symbol, bases] of sessionBasisBySymbol) {
      const ok = bases.size === 1 ? "✓" : "✗";
      console.log(`  ${ok} ${symbol.padEnd(10)} {${[...bases].join(", ")}}`);
      if (bases.size !== 1) violationCount += 1;
    }

    if (intradayElapsedMinutes.length > 0) {
      const sorted = [...intradayElapsedMinutes].sort((a, b) => a - b);
      console.log("\n=== INTRADAY_60M elapsed-minute distribution ===");
      console.log(
        `  n=${sorted.length}  min=${sorted[0].toFixed(1)}  ` +
          `median=${sorted[Math.floor(sorted.length / 2)].toFixed(1)}  ` +
          `max=${sorted[sorted.length - 1].toFixed(1)}`,
      );
    }

    console.log(
      `\ndistinct releaseSessionDay values at v${CURRENT_REACTION_CALCULATION_VERSION}: ` +
        `${releaseSessionDaysByVersion.size}`,
    );

    console.log(`\n${violationCount === 0 ? "✓" : "✗"} ${violationCount} violation(s) found.`);
    if (violationCount > 0) process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
