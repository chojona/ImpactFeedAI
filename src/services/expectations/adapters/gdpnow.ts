import { selectFixtureExpectation } from "@/services/expectations/fixtureStore";
import type { ExpectationFixtureRow } from "@/services/expectations/fixtureTypes";
import { FREE_EXPECTATION_SOURCES } from "@/services/expectations/sources";
import type {
  ExpectationProvider,
  ExpectationQuery,
} from "@/types/expectations";

/**
 * Atlanta Fed GDPNow adapter (MODEL_NOWCAST).
 *
 * Network-free by default: pass fixture rows captured from the public GDPNow
 * archive / FRED GDPNOW notes. Never fabricates missing quarters.
 */
export function createGdpNowProvider(
  rows: readonly ExpectationFixtureRow[],
  options?: { readonly now?: () => Date },
): ExpectationProvider {
  const profile = FREE_EXPECTATION_SOURCES.atlanta_gdpnow;
  return {
    name: profile.id,
    kind: "MODEL_NOWCAST",
    async getExpectation(query: ExpectationQuery) {
      if (query.kind !== "MODEL_NOWCAST") return null;
      return selectFixtureExpectation(rows, query, options?.now?.() ?? new Date());
    },
  };
}
