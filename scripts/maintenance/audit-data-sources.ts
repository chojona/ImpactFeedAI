#!/usr/bin/env tsx
/**
 * Print the data-source coverage audit from the static registry.
 *
 *   npm run audit:sources                    # table
 *   npm run audit:sources -- --json          # machine-readable CoverageAudit
 *   npm run audit:sources -- --today 2027-03-01 --stale-after 60
 *
 * Offline by design: no network, no database, no credentials read. It reports
 * what the registry records (and when each claim was last tested); it does not
 * re-test anything. Exits 1 if the registry fails validation.
 */
import { buildCoverageAudit, isIsoDate } from "@/services/sources/audit";
import { DATA_SOURCE_REGISTRY } from "@/services/sources/registry";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function main(): void {
  const today = argValue("--today") ?? new Date().toISOString().slice(0, 10);
  if (!isIsoDate(today)) throw new Error(`--today must be YYYY-MM-DD, got ${today}`);
  const staleRaw = argValue("--stale-after");
  const staleAfterDays = staleRaw === undefined ? undefined : Number(staleRaw);
  if (staleAfterDays !== undefined && !(Number.isInteger(staleAfterDays) && staleAfterDays >= 0)) {
    throw new Error(`--stale-after must be a non-negative integer, got ${staleRaw}`);
  }

  const audit = buildCoverageAudit(DATA_SOURCE_REGISTRY, { today, staleAfterDays });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(audit, null, 2));
  } else {
    console.log(`Data-source registry (asOf ${audit.registryAsOf}) — audited for ${audit.today}, stale after ${audit.staleAfterDays}d\n`);
    console.table(
      audit.providers.map((p) => ({
        provider: p.providerId,
        auth: p.envVars.length ? `${p.authKind} (${p.envVars.join(", ")})` : p.authKind,
        series: p.seriesCount,
        tested: p.claims.tested,
        advertised: p.claims.advertised,
        unavailable: p.claims.unavailable,
        "PIT ok/cond/no": `${p.pointInTime.eligible}/${p.pointInTime.conditional}/${p.pointInTime.ineligible}`,
        storage: p.storage,
        redistribution: p.redistribution,
        code: p.implementation,
        validated: p.lastSuccessfulValidation ?? "never",
        stale: p.stale ? "STALE" : "",
      })),
    );
    const t = audit.totals;
    console.log(
      `\n${t.providers} providers · ${t.series} series · ${t.tested} tested / ${t.advertised} advertised / ${t.unavailable} unavailable claims · ${t.staleProviders} stale`,
    );
  }

  if (audit.issues.length > 0) {
    console.error(`\n${audit.issues.length} registry issue(s):`);
    for (const i of audit.issues) console.error(`  ${i.code}  ${i.path}: ${i.message}`);
    process.exitCode = 1;
  }
}

main();
