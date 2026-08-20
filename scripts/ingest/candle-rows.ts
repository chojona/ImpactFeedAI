/**
 * Turning a provider outcome into persistable rows.
 *
 * Kept out of the backfill script so it can be imported and tested without
 * executing a CLI entrypoint — the scripts in this repository call `main()` at
 * module scope, so anything a test needs has to live beside them rather than
 * inside them.
 */
import type { CandleFetchOutcome } from "./candle-provider";
import {
  CURRENT_CANDLE_INGESTION_VERSION,
  ohlcViolations,
} from "@/services/market/candles";
import type {
  CandleInterval,
  MarketSession,
  PriceBasis,
} from "@/types/market";

export interface CandleRow {
  symbol: string;
  interval: CandleInterval;
  openTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  session: MarketSession;
  priceBasis: PriceBasis;
  adjustmentFactor: number | null;
  provider: string;
  ingestionVersion: number;
  fetchedAt: Date;
}

export interface RowBuildResult {
  rows: CandleRow[];
  /** Bars dropped for failing an OHLC invariant. Never repaired. */
  malformed: number;
}

/**
 * Build rows from a successful fetch, dropping any bar that is not internally
 * coherent.
 *
 * A bar whose high sits below its close is not clamped into agreement — it is
 * discarded and counted. Clamping would draw a candle that never traded, and it
 * would do so invisibly, which is worse than a gap in the series.
 */
export function rowsFromOutcome(
  outcome: Extract<CandleFetchOutcome, { status: "ok" }>,
  symbol: string,
  interval: CandleInterval,
  provider: string,
  fetchedAt: Date,
): RowBuildResult {
  const rows: CandleRow[] = [];
  let malformed = 0;

  for (const candle of outcome.candles) {
    if (ohlcViolations(candle).length > 0) {
      malformed += 1;
      continue;
    }
    rows.push({
      symbol,
      interval,
      openTime: candle.openTime,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      session: candle.session,
      priceBasis: outcome.priceBasis,
      adjustmentFactor: outcome.adjustmentFactor,
      provider,
      ingestionVersion: CURRENT_CANDLE_INGESTION_VERSION,
      fetchedAt,
    });
  }

  return { rows, malformed };
}
