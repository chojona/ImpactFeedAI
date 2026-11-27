/**
 * Central data-source registry — the single machine-readable answer to "what
 * can each provider actually give us, and how do we know?".
 *
 * Every coverage claim is one of:
 *   TESTED      a live request returned the data on `testedOn`
 *   ADVERTISED  the provider documents it; nothing here exercised it
 *   UNAVAILABLE refused (observed, or documented) under the stated access tier
 *
 * The registry is metadata only: no adapter, no fetch, no credentials. Adapters
 * stay where they are (see `implementations` on each provider); this file only
 * describes them. Integrity rules are enforced by `validateRegistry` in
 * `./audit.ts` and run in the test suite, so a claim cannot drift (for example a
 * TESTED claim without a date) without failing `npm test`.
 *
 * To re-validate a provider: run the probe, update the affected claims'
 * `testedOn` and evidence, then update `lastSuccessfulValidation` to the newest
 * TESTED date (the validator checks they agree).
 */
import type { DataProviderEntry, DataSourceRegistry } from "@/types/dataSources";

import { ALFRED_PROVIDER } from "./providers/alfred";
import { ALPHA_VANTAGE_PROVIDER } from "./providers/alphaVantage";
import { BLS_PROVIDER } from "./providers/bls";
import { CBOE_PROVIDER } from "./providers/cboe";
import { CLEVELAND_FED_PROVIDER } from "./providers/clevelandFed";
import { FRED_PROVIDER } from "./providers/fred";
import { NQ_ARCHIVE_PROVIDER } from "./providers/nqArchive";
import { SF_FED_PROVIDER } from "./providers/sfFed";
import { TREASURY_PROVIDER } from "./providers/treasury";
import { YAHOO_PROVIDER } from "./providers/yahoo";

export const DATA_SOURCE_REGISTRY: DataSourceRegistry = {
  schemaVersion: 1,
  asOf: "2026-11-27",
  providers: [
    BLS_PROVIDER,
    FRED_PROVIDER,
    ALFRED_PROVIDER,
    ALPHA_VANTAGE_PROVIDER,
    YAHOO_PROVIDER,
    CBOE_PROVIDER,
    TREASURY_PROVIDER,
    CLEVELAND_FED_PROVIDER,
    SF_FED_PROVIDER,
    NQ_ARCHIVE_PROVIDER,
  ],
};

export function getProvider(
  id: string,
  registry: DataSourceRegistry = DATA_SOURCE_REGISTRY,
): DataProviderEntry | null {
  return registry.providers.find((p) => p.id === id) ?? null;
}
