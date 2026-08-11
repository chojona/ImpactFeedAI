/**
 * Shared types between the FRED/BLS/FOMC source generators and the
 * auto-ingest orchestrator.
 */

import type { EventTypeName } from "@/types/events";

export type SourceTag = "FRED" | "BLS" | "FOMC";

/** Must stay in sync with the Prisma EventTimingStatus enum. */
export type EventTimingStatus =
  | "VERIFIED"
  | "SCHEDULED"
  | "INFERRED"
  | "DATE_ONLY"
  | "REFERENCE_PERIOD_ONLY"
  | "UNVERIFIED";

/** Must stay in sync with the Prisma ConsensusStatus enum. */
export type ConsensusStatus = "VERIFIED" | "UNVERIFIED" | "MISSING";

/**
 * Source-independent identity for the initial release of one macro reference
 * period. FRED and BLS observations for the same canonical metric deliberately
 * produce the same key.
 */
export const macroInitialEventKey = (
  metricKey: string,
  referenceIso: string,
): string => `macro:${metricKey}:initial:${referenceIso}`;

export interface CandidateEventData {
  /** Stable identity from the canonical macro metric registry. */
  metricKey: string;
  metricName: string;
  /** Period the source value measures; this is not a publication timestamp. */
  referencePeriodStart: Date | null;
  actualValue: number | null;
  priorValue: number | null;
  expectedValue: number | null;
  surpriseMagnitude: number | null;
  actualSource: string | null;
  actualSourceUrl: string | null;
  consensusStatus: ConsensusStatus;
  consensusSource: string | null;
  consensusSourceUrl: string | null;
  consensusAsOf: Date | null;
  /** Raw source observation value before the canonical headline transform. */
  rawActual?: number | null;
}

export interface CandidateEvent {
  /** Stable natural key. It must not depend on a mutable timestamp/headline. */
  eventKey: string;
  headline: string;
  eventType: EventTypeName;
  /**
   * Compatibility display/order fallback. This is not a reaction anchor unless
   * `releaseAt` is also present and trusted by the downstream timing policy.
   */
  occurredAt: Date;
  /** Exact market-facing release instant. Null when the source cannot prove it. */
  releaseAt: Date | null;
  /** Publication day when known without an exact instant (or inferred). */
  releaseDate: Date | null;
  timingStatus: EventTimingStatus;
  timingSource: string | null;
  sourceUrl: string;
  source: SourceTag;
  data: CandidateEventData;
}
