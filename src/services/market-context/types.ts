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

/** How precisely availability was established. */
export type AvailabilityPrecision = "timestamp" | "date" | "unknown";

export type MarketContextProvider = "cboe" | "us_treasury" | "fred";

export type ObservationParseStatus = "ok" | "missing" | "invalid";

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
  readonly parseStatus: ObservationParseStatus;
  readonly knowledgeMode: KnowledgeMode;
}

/**
 * Full adapter output: lean observation + retrieval provenance.
 * Feature calculators should consume `observation` only.
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
