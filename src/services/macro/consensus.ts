/**
 * Provider boundary for historical consensus estimates.
 *
 * FRED and the BLS timeseries API publish observations, not market consensus.
 * A future licensed/provider integration belongs behind this interface so a
 * number cannot enter DataRelease.expectedValue without source and as-of
 * metadata travelling with it.
 */

export interface ConsensusQuery {
  metricKey: string;
  referencePeriodStart: Date | null;
  /** Exact release instant, when one has been independently established. */
  releaseAt: Date | null;
}

export interface ConsensusEstimate {
  value: number;
  /** When the estimate snapshot was observed. Must not be after releaseAt. */
  asOf: Date;
  source: string;
  sourceUrl: string;
}

export interface ConsensusProvider {
  readonly name: string;
  getHistoricalConsensus(
    query: ConsensusQuery,
  ): Promise<ConsensusEstimate | null>;
}

/**
 * Validate the invariants every provider must meet before persistence.
 * Returns a normalized copy and throws rather than silently accepting an
 * unsourced, non-finite, or look-ahead estimate.
 */
export function validateConsensusEstimate(
  estimate: ConsensusEstimate,
  releaseAt: Date | null,
): ConsensusEstimate {
  if (!Number.isFinite(estimate.value)) {
    throw new Error("Consensus value must be finite.");
  }
  if (Number.isNaN(estimate.asOf.getTime())) {
    throw new Error("Consensus as-of timestamp is invalid.");
  }
  if (estimate.source.trim().length === 0) {
    throw new Error("Consensus source is required.");
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(estimate.sourceUrl);
  } catch {
    throw new Error("Consensus sourceUrl must be an absolute URL.");
  }
  if (parsedUrl.protocol !== "https:") {
    throw new Error("Consensus sourceUrl must use HTTPS.");
  }
  if (releaseAt && estimate.asOf.getTime() > releaseAt.getTime()) {
    throw new Error("Consensus as-of timestamp cannot be after the release.");
  }
  return {
    ...estimate,
    source: estimate.source.trim(),
    sourceUrl: parsedUrl.toString(),
    asOf: new Date(estimate.asOf),
  };
}
