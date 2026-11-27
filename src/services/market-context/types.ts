/**
 * Adapter-layer types for official market-context retrieval.
 *
 * Observations remain compatible with {@link MarketContextObservation}.
 * Retrieval metadata lives beside them so feature math stays pure over the
 * lean contract while provenance survives for research audits.
 */

import type {
  KnowledgeMode,
  MarketContextObservation,
} from "@/types/context";
import type { AvailabilityPolicyVersion } from "@/services/market-context/availability";

/** How precisely availability was established. */
export type AvailabilityPrecision = "timestamp" | "date" | "unknown";

export type MarketContextProvider =
  | "cboe"
  | "us_treasury"
  | "fred"
  /** Equity close series (e.g. SPY); fetch adapter lives outside this PR. */
  | "equity_price";

export type ObservationParseStatus = "ok" | "missing" | "invalid";

/**
 * Whether the observation may enter historical public-information reconstruction.
 * FRED current-revised pulls are `false` unless an ALFRED-style vintage is used.
 */
export type HistoricalReconstructionStatus =
  | "eligible"
  | "ineligible_revised_latest"
  | "ineligible_unknown_availability"
  | "ineligible_missing";

/** Injected fetch so adapters stay network-free under test. */
export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface RetrievalMetadata {
  readonly fetchedAt: Date;
  readonly sourceProvider: MarketContextProvider;
  readonly sourceEndpoint: string;
  readonly requestId: string | null;
  readonly etag: string | null;
  /** Original textual value from the payload before numeric parse. */
  readonly rawValue: string | null;
  readonly availabilityPrecision: AvailabilityPrecision;
  readonly availabilityPolicyVersion: AvailabilityPolicyVersion | null;
  readonly parseStatus: ObservationParseStatus;
  readonly knowledgeMode: KnowledgeMode;
  readonly historicalReconstruction: HistoricalReconstructionStatus;
  /**
   * ALFRED-style realtime vintage date (`YYYY-MM-DD`) when the pull was
   * vintage-bounded; null for current-revised FRED defaults.
   */
  readonly vintageAsOf: string | null;
}

/**
 * Full adapter output: lean observation + retrieval provenance.
 * Feature calculators should consume `observation` only.
 * SYSTEM_REPLAY selectors must read `observation.fetchedAt` (strict `< cutoff`).
 */
export interface RetrievedMarketObservation {
  readonly observation: MarketContextObservation;
  readonly retrieval: RetrievalMetadata;
}

export interface MarketContextFetchError {
  readonly kind: "http_error" | "parse_error" | "config_error";
  readonly message: string;
  readonly sourceProvider: MarketContextProvider;
  readonly sourceEndpoint: string;
  readonly statusCode: number | null;
}

export type MarketContextFetchResult =
  | {
      readonly ok: true;
      readonly observations: readonly RetrievedMarketObservation[];
      readonly retrievalBatch: {
        readonly fetchedAt: Date;
        readonly sourceProvider: MarketContextProvider;
        readonly sourceEndpoint: string;
        readonly requestId: string | null;
        readonly etag: string | null;
      };
    }
  | {
      readonly ok: false;
      readonly error: MarketContextFetchError;
    };
