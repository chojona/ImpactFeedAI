#!/usr/bin/env tsx
/** Read-only classification of legacy actuals. Nonzero means PIT research
 * remains data-blocked; descriptive eligibility is reported separately. */
import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { createDryRunPrismaClient } from "../lib/readonly-prisma";
import { qualifyLegacyActual } from "@/services/macro/actualProvenance";

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--report") throw new Error("Usage: --report <file>");
  const prisma = createDryRunPrismaClient();
  try {
    const state = await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const [readOnly] = await tx.$queryRawUnsafe<{ transaction_read_only: string }[]>("SHOW transaction_read_only");
      if (readOnly.transaction_read_only !== "on") throw new Error("Read-only transaction required");
      const releases = await tx.dataRelease.findMany({ orderBy: { id: "asc" } });
      const measurementVersions = await tx.reactionMeasurement.groupBy({ by: ["calculationVersion"], _count: { _all: true } });
      return { releases, measurementVersions };
    }, { isolationLevel: "RepeatableRead" });
    const rows = state.releases.map(r => ({ id: r.id, eventId: r.eventId, actualValue: r.actualValue,
      metricKey: r.metricKey, referencePeriodStart: r.referencePeriodStart,
      hasActualSource: Boolean(r.actualSource?.trim()), hasActualSourceUrl: Boolean(r.actualSourceUrl?.trim()),
      consensusStatus: r.consensusStatus, ...qualifyLegacyActual(r.actualValue),
    }));
    const output = { generatedAt: new Date().toISOString(), databaseReadOnly: true,
      summary: { total: rows.length, withActual: rows.filter(r => r.actualValue !== null).length,
        descriptiveEligible: rows.filter(r => r.descriptiveEligible).length,
        pointInTimeEligible: rows.filter(r => r.pointInTimeEligible).length,
        missingMetricKey: rows.filter(r => !r.metricKey).length,
        missingReferencePeriod: rows.filter(r => !r.referencePeriodStart).length,
        missingActualSource: rows.filter(r => !r.hasActualSource).length,
        missingActualSourceUrl: rows.filter(r => !r.hasActualSourceUrl).length,
        verifiedConsensus: rows.filter(r => r.consensusStatus === "VERIFIED").length,
      }, measurementVersions: state.measurementVersions, rows,
      passedForPointInTimeResearch: rows.length > 0 && rows.every(r => r.pointInTimeEligible),
      limitation: "Legacy DataRelease has no immutable revision/publication/availability fields. No first-print or release-time certification can be recovered from these records alone." };
    await writeFile(args[1], JSON.stringify(output, null, 2) + "\n");
    console.log(JSON.stringify(output, null, 2));
    if (!output.passedForPointInTimeResearch) process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
}
main().catch(() => { console.error("Provenance audit incomplete; check read-only database access and --report path."); process.exitCode = 1; });
