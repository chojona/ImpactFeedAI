/**
 * Shared types between the FRED/BLS/FOMC source generators and the
 * auto-ingest orchestrator.
 */

export type EventTypeLiteral =
  | "TARIFF"
  | "FED_DECISION"
  | "CPI"
  | "PPI"
  | "NFP"
  | "GEOPOLITICAL"
  | "EARNINGS_SURPRISE"
  | "MACRO_DATA";

export type SourceTag = "FRED" | "BLS" | "FOMC";

export interface CandidateEventData {
  metricName: string;
  actualValue: number | null;
  priorValue: number | null;
  expectedValue: number | null;
  surpriseMagnitude: number | null;
  /** Raw FRED/BLS observation value (before headline transformation). Stored for traceability. */
  rawActual?: number | null;
}

export interface CandidateEvent {
  headline: string;
  eventType: EventTypeLiteral;
  occurredAt: Date;
  sourceUrl: string;
  source: SourceTag;
  data: CandidateEventData;
}