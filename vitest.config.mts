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
  },
});
