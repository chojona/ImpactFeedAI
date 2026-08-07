/**
 * Yahoo Finance price fetcher.
 *
 * For each symbol + event timestamp, return prices at the event, +1h, +1d, +1w.
 * Best-effort: every failure → null in the result rather than throwing. Caller
 * skips an asset entirely only when the anchor (priceAtEvent) is unavailable.
 *
 * Intraday (1h) data is only retained by Yahoo for ~730 days. Older events fall
 * back to daily-only granularity (price_1h will be null).
 */
import YahooFinance from "yahoo-finance2";

import type { PriceSnapshot } from "./types";

// In v3+, yahoo-finance2 deprecated the singleton form (calling the import
// directly). Instantiate once and reuse.
const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey", "ripHistorical"],
});

interface Candle {
  date: Date;
  open: number | null;
  close: number | null;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const INTRADAY_HORIZON_MS = 720 * DAY_MS; // Yahoo keeps ~2y of 1h candles

function pickFirstAtOrAfter(
  candles: Candle[],
  target: Date,
): Candle | null {
  for (const c of candles) {
    if (c.date.getTime() >= target.getTime()) return c;
  }
  return null;
}

function pickPrice(candle: Candle | null): number | null {
  if (!candle) return null;
  // Prefer open (closest to "what you'd have paid at this moment"); fall back
  // to close if open is missing (some intraday candles lack it on session open).
  return candle.open ?? candle.close ?? null;
}

/**
 * Fetch a price snapshot for one symbol around the event time.
 *
 * Returns null when even the anchor price can't be sourced — caller skips the
 * AssetReaction row entirely. Otherwise returns a PriceSnapshot where the 1h,
 * 1d, 1w fields may be null individually.
 */
export async function fetchPriceSnapshot(
  symbol: string,
  occurredAt: Date,
): Promise<PriceSnapshot | null> {
  const ageMs = Date.now() - occurredAt.getTime();
  const intradayAvailable = ageMs >= 0 && ageMs < INTRADAY_HORIZON_MS;

  // ── Intraday window (anchor + t+1h) ────────────────────────────────────
  let intradayCandles: Candle[] = [];
  if (intradayAvailable) {
    try {
      const result = await yahooFinance.chart(symbol, {
        period1: new Date(occurredAt.getTime() - 2 * HOUR_MS),
        period2: new Date(occurredAt.getTime() + 12 * HOUR_MS),
        interval: "1h",
        return: "array",
      });
      intradayCandles = result.quotes.map((q) => ({
        date: q.date,
        open: q.open,
        close: q.close,
      }));
    } catch (err) {
      logSymbolWarning(symbol, "intraday fetch failed", err);
    }
  }

  // ── Daily window (anchor fallback + t+1d + t+1w) ───────────────────────
  let dailyCandles: Candle[] = [];
  try {
    const result = await yahooFinance.chart(symbol, {
      // Pull a generous window so weekends/holidays don't push us off the end
      period1: new Date(occurredAt.getTime() - 3 * DAY_MS),
      period2: new Date(occurredAt.getTime() + 14 * DAY_MS),
      interval: "1d",
      return: "array",
    });
    dailyCandles = result.quotes.map((q) => ({
      date: q.date,
      open: q.open,
      close: q.close,
    }));
  } catch (err) {
    logSymbolWarning(symbol, "daily fetch failed", err);
  }

  // ── Anchor: prefer intraday, fall back to daily ────────────────────────
  const intradayAnchor = pickPrice(
    pickFirstAtOrAfter(intradayCandles, occurredAt),
  );
  const dailyAnchor = pickPrice(pickFirstAtOrAfter(dailyCandles, occurredAt));
  const priceAtEvent = intradayAnchor ?? dailyAnchor;
  if (priceAtEvent === null) return null;

  // ── t+1h: intraday only ─────────────────────────────────────────────────
  const price1h = pickPrice(
    pickFirstAtOrAfter(intradayCandles, new Date(occurredAt.getTime() + HOUR_MS)),
  );

  // ── t+1d: next daily candle on or after t+1d ────────────────────────────
  const price1d = pickPrice(
    pickFirstAtOrAfter(dailyCandles, new Date(occurredAt.getTime() + DAY_MS)),
  );

  // ── t+1w: daily candle on or after t+7d (~5 trading days) ──────────────
  const price1w = pickPrice(
    pickFirstAtOrAfter(
      dailyCandles,
      new Date(occurredAt.getTime() + 7 * DAY_MS),
    ),
  );

  return { priceAtEvent, price1h, price1d, price1w };
}

function logSymbolWarning(symbol: string, msg: string, err: unknown): void {
  const detail = err instanceof Error ? err.message : String(err);
  console.warn(`  ⚠ ${symbol}: ${msg} — ${detail}`);
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));