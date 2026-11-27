import { selectFixtureExpectation } from "@/services/expectations/fixtureStore";
import type { ExpectationFixtureRow } from "@/services/expectations/fixtureTypes";
import { FREE_EXPECTATION_SOURCES } from "@/services/expectations/sources";
import type {
  ExpectationProvider,
  ExpectationQuery,
} from "@/types/expectations";

/**
 * FRED market-implied series adapter (MARKET_IMPLIED).
 * Daily observation dates map to DATE_ONLY — FRED does not supply an 08:30
 * print consensus.
 */
export function createMarketImpliedProvider(
  rows: readonly ExpectationFixtureRow[],
  options?: { readonly now?: () => Date },
): ExpectationProvider {
  const profile = FREE_EXPECTATION_SOURCES.fred_market_implied;
  for (const row of rows) {
    if (row.kind !== "MARKET_IMPLIED") {
      throw new Error("Market-implied store may only hold MARKET_IMPLIED rows.");
    }
  }
  return {
    name: profile.id,
    kind: "MARKET_IMPLIED",
    async getExpectation(query: ExpectationQuery) {
      if (query.kind !== "MARKET_IMPLIED") return null;
      return selectFixtureExpectation(rows, query, options?.now?.() ?? new Date());
    },
  };
}
