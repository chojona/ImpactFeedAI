import { selectFixtureExpectation } from "@/services/expectations/fixtureStore";
import type { ExpectationFixtureRow } from "@/services/expectations/fixtureTypes";
import { FREE_EXPECTATION_SOURCES } from "@/services/expectations/sources";
import type {
  ExpectationProvider,
  ExpectationQuery,
} from "@/types/expectations";

/**
 * Cleveland Fed Inflation Nowcasting adapter (MODEL_NOWCAST).
 *
 * Public chart feeds expose calendar "Updated" dates — fixtures should use
 * DATE_ONLY asOfQuality unless an exact instant is published.
 */
export function createClevelandNowcastProvider(
  rows: readonly ExpectationFixtureRow[],
  options?: { readonly now?: () => Date },
): ExpectationProvider {
  const profile = FREE_EXPECTATION_SOURCES.cleveland_inflation_nowcast;
  return {
    name: profile.id,
    kind: "MODEL_NOWCAST",
    async getExpectation(query: ExpectationQuery) {
      if (query.kind !== "MODEL_NOWCAST") return null;
      return selectFixtureExpectation(rows, query, options?.now?.() ?? new Date());
    },
  };
}
