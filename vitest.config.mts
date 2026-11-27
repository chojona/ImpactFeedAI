import { defineConfig } from "vitest/config";

/**
 * Unit tests only, `node` environment, no DOM.
 *
 * The suite deliberately covers pure functions: the macro transforms, the price
 * window resolution, the database→UI mapper, the query parsing and the pattern
 * aggregation. Those are where a wrong unit or a coerced null becomes wrong
 * *data*, and they need no database, no network and no browser to test.
 *
 * Component and end-to-end coverage (`@testing-library/react`, Playwright) is
 * still outstanding — see docs/architecture.md#testing.
 *
 * `.mts` so Vite loads it as ESM natively rather than warning about ESM syntax
 * in a CommonJS-resolved file.
 *
 * Coverage focuses on quantitative / data-integrity modules. Thresholds are set
 * slightly below a measured baseline so CI fails on real regressions without
 * inventing aspirational gates that fail today.
 *
 * Measured baseline after rebase onto main `b1b069d` (post-#18 security bump)
 * with `@vitest/coverage-v8` (`npm run test:coverage`, 2026-11-27):
 *   statements 92.46% | branches 88.8% | functions 93.93% | lines 93.35%
 */
export default defineConfig({
  resolve: {
    // Honour the `@/*` alias from tsconfig.json so tests import the same
    // specifiers as the app instead of a parallel set of relative paths.
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Keep failures loud: a silently-skipped suite is worse than no suite.
    passWithNoTests: false,
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      reporter: ["text", "lcov", "json-summary"],
      include: [
        "src/services/macro/metrics.ts",
        "src/services/macro/consensus.ts",
        "src/services/macro/time.ts",
        "src/services/macro/release-calendar.ts",
        "src/services/events/timing.ts",
        "src/services/events/mapEvent.ts",
        "src/services/events/reactionMeasurement.ts",
        "src/services/events/reactionMeasures.ts",
        "src/services/events/queryParams.ts",
        "src/services/market/sessionCalendar.ts",
        "src/services/market/sessionCalendar.internal.ts",
        "src/services/market/sessionBasis.ts",
        "src/services/analytics/patternAnalysis.ts",
        "scripts/ingest/fetch-prices.ts",
      ],
      thresholds: {
        statements: 91,
        branches: 87,
        functions: 93,
        lines: 92,
      },
    },
  },
});
