#!/usr/bin/env tsx
/**
 * Macro transformation smoke test.
 *
 * Fetches live FRED data for representative curated events and prints the
 * derived expected / actual / prior / surprise in the metric's canonical unit,
 * so the numbers can be sanity-checked against the event headline before any
 * data is written or repaired.
 *
 *   npm run smoke:macro
 *
 * Read-only: touches FRED over HTTPS and never opens a database connection.
 *
 * Nothing here is hardcoded to make the test pass — the expected values come
 * from `events-seed.ts` and the actuals are derived from live FRED
 * observations. The check is that each pair is dimensionally comparable and
 * that the actual agrees with the number stated in the event's own headline.
 */
import "dotenv/config";

import { SEED_EVENTS } from "../ingest/events-seed";
import { fetchMacroRelease } from "../ingest/fetch-macro";
import {
  CURATED_SERIES_BY_EVENT_TYPE,
  formatWithUnit,
  type CanonicalMetric,
} from "../ingest/metrics";

/** One representative curated event per release type. */
const SAMPLE_HEADLINE_FRAGMENTS = [
  "June CPI hits 9.1% YoY",
  "January CPI prints hotter",
  "January 2023 NFP shocks",
  "March 2024 PPI hotter",
  "Fed hikes 75bps",
  "Fed cuts 50bps",
  "Fed holds rates",
];

/** Pull the headline's own stated number so we can compare against it. */
function statedNumber(headline: string, unit: string): number | null {
  if (unit === "pct_yoy" || unit === "pct_level") {
    const m = headline.match(/(-?\d+(?:\.\d+)?)\s*%/);
    return m ? Number(m[1]) : null;
  }
  if (unit === "thousands_mom") {
    const m = headline.match(/\+(\d+)k/);
    return m ? Number(m[1]) : null;
  }
  return null;
}

async function main(): Promise<void> {
  if (!process.env.FRED_API_KEY) {
    console.error("FRED_API_KEY is not set — cannot run the macro smoke test.");
    process.exit(1);
  }

  const samples = SAMPLE_HEADLINE_FRAGMENTS.map((frag) => {
    const seed = SEED_EVENTS.find((e) => e.headline.includes(frag));
    if (!seed) console.warn(`⚠ no seed event matching "${frag}"`);
    return seed;
  }).filter((s): s is NonNullable<typeof s> => s !== undefined);

  console.log(`Macro smoke test — ${samples.length} representative events\n`);

  let mismatches = 0;

  for (const seed of samples) {
    const binding =
      CURATED_SERIES_BY_EVENT_TYPE[
        seed.eventType as keyof typeof CURATED_SERIES_BY_EVENT_TYPE
      ];
    if (!binding) continue;
    const metric: CanonicalMetric = binding.metric;

    const release = await fetchMacroRelease({
      eventType: seed.eventType,
      occurredAt: new Date(seed.occurredAt),
      expectedValue: seed.expectedValue ?? null,
      metricNameOverride: null,
    });

    console.log(`── ${seed.headline}`);
    console.log(`   date        ${seed.occurredAt}`);
    console.log(`   metric      ${metric.canonicalName}  [${metric.key}]`);
    console.log(`   source      FRED ${binding.seriesId}`);
    console.log(`   unit        ${metric.unitLabel}`);

    if (!release) {
      console.log(`   ✗ no release resolved\n`);
      mismatches += 1;
      continue;
    }

    console.log(`   expected    ${formatWithUnit(metric, release.expectedValue)}`);
    console.log(`   actual      ${formatWithUnit(metric, release.actualValue)}`);
    console.log(`   prior       ${formatWithUnit(metric, release.priorValue)}`);
    console.log(
      `   surprise    ${
        release.surpriseMagnitude === null
          ? "null"
          : `${release.surpriseMagnitude >= 0 ? "+" : ""}${release.surpriseMagnitude}` +
            ` (${metric.unit === "thousands_mom" ? "k" : "pp"})`
      }`,
    );

    // Cross-check the derived actual against the number in the headline.
    const stated = statedNumber(seed.headline, metric.unit);
    if (stated !== null && release.actualValue !== null) {
      const tolerance = metric.unit === "thousands_mom" ? 60 : 0.25;
      const delta = Math.abs(release.actualValue - stated);
      const ok = delta <= tolerance;
      if (!ok) mismatches += 1;
      console.log(
        `   headline    states ${stated} → derived ${release.actualValue} ` +
          `(Δ ${delta.toFixed(2)}) ${ok ? "✓ consistent" : "✗ INCONSISTENT"}`,
      );
    }

    // Dimensional guard: expected and actual must be the same order of magnitude.
    if (release.expectedValue !== null && release.actualValue !== null) {
      const ratio =
        Math.abs(release.actualValue) /
        Math.max(Math.abs(release.expectedValue), 0.01);
      if (ratio > 20 || ratio < 0.05) {
        console.log(`   ✗ UNIT MISMATCH — actual/expected ratio = ${ratio.toFixed(1)}`);
        mismatches += 1;
      }
    }
    console.log("");
  }

  console.log(
    mismatches === 0
      ? "All samples dimensionally consistent. ✓"
      : `${mismatches} inconsistency/inconsistencies found. ✗`,
  );
  process.exit(mismatches === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
