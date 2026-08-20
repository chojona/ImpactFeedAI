/**
 * Candle provider adapters.
 *
 * Everything provider-specific lives behind {@link CandleProvider}: interval
 * spelling, lookback limits, adjustment behaviour, volume quirks, and the
 * basis-consistency check that only exists because one provider needs it.
 * Callers receive normalised bars with a declared {@link PriceBasis}, or an
 * explicit refusal — never a partially-trustworthy series.
 *
 * The interface is intentionally small. It is shaped by one real provider plus
 * the known requirements of a second (Polygon), not by speculation about a
 * general market-data abstraction. Adding Polygon should mean writing one more
 * object that satisfies this interface and changing one line in the backfill.
 *
 * ### Why the adapter refuses rather than repairs
 *
 * Yahoo serves intraday OHLC as-traded and daily OHLC split-adjusted. When an
 * instrument has split inside the intraday window, the two series describe the
 * same security at different scales. The ratio is *recoverable* in principle —
 * it is the split factor — but reconstructing it here would mean inferring a
 * corporate action from a price ratio and rescaling real observations by a
 * guessed number. A rejected fetch costs coverage; a silently rescaled one
 * produces candles that look exactly like correct candles. The pipeline takes
 * the first cost.
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import YahooFinance from "yahoo-finance2";

import {
  classifySession,
  intervalReachableAt,
  normalizeProviderVolume,
} from "./candle-semantics";
import {
  intradayDailyBasisRatio,
  seriesShareBasis,
  type Candle as BasisCandle,
} from "./fetch-prices";
import type {
  CandleInterval,
  MarketSession,
  PriceBasis,
} from "@/types/market";

const DAY_MS = 86_400_000;

/** One bar as an adapter hands it back: normalised, not yet persisted. */
export interface ProviderCandle {
  /** Bar open instant, UTC. */
  openTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Already normalised — null means the provider withheld a quantity. */
  volume: number | null;
  session: MarketSession;
}

export interface CandleFetchRequest {
  symbol: string;
  interval: CandleInterval;
  from: Date;
  to: Date;
}

/**
 * Why a fetch produced no usable candles. Each variant is reported separately
 * by the backfill, because "the provider dropped this history", "the two series
 * disagree" and "the request failed" call for completely different responses.
 */
export type CandleFetchOutcome =
  | {
      status: "ok";
      candles: ProviderCandle[];
      priceBasis: PriceBasis;
      /** Split factor already applied, when the provider discloses one. */
      adjustmentFactor: number | null;
      /** Bars whose provider volume was withheld rather than stored as zero. */
      volumeWithheld: number;
    }
  | { status: "unreachable"; reason: string }
  | { status: "basis_rejected"; ratio: number; reason: string }
  | { status: "empty"; reason: string }
  | { status: "provider_error"; reason: string };

export interface CandleProvider {
  /** Stable identity persisted with every row, e.g. `yahoo-finance2@3.14.0`. */
  readonly id: string;
  /** Intervals this adapter can serve at all. */
  supports(interval: CandleInterval): boolean;
  /** Whether history for `at` is still within the provider's window. */
  reachable(interval: CandleInterval, at: Date, now?: Date): boolean;
  fetchCandles(request: CandleFetchRequest): Promise<CandleFetchOutcome>;
}

/* ─────────────────────────────── Yahoo adapter ──────────────────────────── */

/** Yahoo's own interval vocabulary. Nothing outside this file uses it. */
const YAHOO_INTERVAL: Readonly<Partial<Record<CandleInterval, string>>> = {
  ONE_MINUTE: "1m",
  FIVE_MINUTE: "5m",
  FIFTEEN_MINUTE: "15m",
  THIRTY_MINUTE: "30m",
  ONE_HOUR: "1h",
  ONE_DAY: "1d",
};

/**
 * Which basis each Yahoo series is quoted on. Measured, not assumed:
 * on 2025-01-10 XLK's daily open was 115.71 against an hourly open of 232.89,
 * a ratio of 2.0127 explained entirely by its 2025-12-05 2:1 split being
 * applied retroactively to the daily series and not to the intraday one.
 */
const YAHOO_BASIS: Readonly<Record<CandleInterval, PriceBasis>> = {
  ONE_MINUTE: "AS_TRADED",
  FIVE_MINUTE: "AS_TRADED",
  FIFTEEN_MINUTE: "AS_TRADED",
  THIRTY_MINUTE: "AS_TRADED",
  ONE_HOUR: "AS_TRADED",
  ONE_DAY: "SPLIT_ADJUSTED",
};

const isIntraday = (interval: CandleInterval): boolean =>
  interval !== "ONE_DAY";

interface YahooQuote {
  date: Date;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

export interface YahooProviderOptions {
  /** Injected in tests so the adapter can be exercised without the network. */
  chart?: (
    symbol: string,
    options: { period1: Date; period2: Date; interval: string },
  ) => Promise<{ quotes: YahooQuote[] }>;
  /** Overrides the recorded library version in the provider id. */
  version?: string;
}

/**
 * The version is part of the provider id so a stored row can be traced to the
 * client that produced it. Resolved from the installed package rather than
 * hardcoded, because a literal silently goes stale on the next `npm update`
 * and every row written afterwards would then carry a false provenance.
 *
 * `createRequire` rather than a bare `require`: these scripts run as ESM under
 * tsx, where `require` is not defined.
 */
function resolveYahooVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    // The package does not expose ./package.json in its exports map, so it
    // cannot be required directly. Resolve the entry point and walk up to the
    // nearest manifest instead.
    let dir = dirname(require.resolve("yahoo-finance2"));
    for (let depth = 0; depth < 6; depth += 1) {
      const manifest = join(dir, "package.json");
      if (existsSync(manifest)) {
        const pkg = JSON.parse(readFileSync(manifest, "utf8")) as {
          name?: string;
          version?: string;
        };
        if (pkg.name === "yahoo-finance2" && pkg.version) return pkg.version;
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

export function createYahooCandleProvider(
  options: YahooProviderOptions = {},
): CandleProvider {
  const client = new YahooFinance({
    suppressNotices: ["yahooSurvey", "ripHistorical"],
  });

  const chart =
    options.chart ??
    (async (symbol, opts) => {
      const result = await client.chart(symbol, {
        period1: opts.period1,
        period2: opts.period2,
        interval: opts.interval as "1m" | "5m" | "15m" | "30m" | "1h" | "1d",
        return: "array",
      });
      return { quotes: result.quotes as unknown as YahooQuote[] };
    });

  const id = `yahoo-finance2@${options.version ?? resolveYahooVersion()}`;

  return {
    id,

    supports: (interval) => YAHOO_INTERVAL[interval] !== undefined,

    reachable: (interval, at, now) => intervalReachableAt(interval, at, now),

    async fetchCandles({ symbol, interval, from, to }) {
      const yahooInterval = YAHOO_INTERVAL[interval];
      if (yahooInterval === undefined) {
        return {
          status: "provider_error",
          reason: `interval ${interval} is not supported by this provider`,
        };
      }

      // Reachability is checked against the *oldest* instant requested: Yahoo
      // rejects the whole request if any part of the range predates its window.
      if (!intervalReachableAt(interval, from)) {
        return {
          status: "unreachable",
          reason: `${from.toISOString().slice(0, 10)} is outside the provider's ${interval} window`,
        };
      }

      let quotes: YahooQuote[];
      try {
        const result = await chart(symbol, {
          period1: from,
          period2: to,
          interval: yahooInterval,
        });
        quotes = result.quotes ?? [];
      } catch (error) {
        return {
          status: "provider_error",
          reason:
            error instanceof Error ? error.message : String(error),
        };
      }

      if (quotes.length === 0) {
        return { status: "empty", reason: "provider returned no bars" };
      }

      // Drop incomplete bars first. A bar with a missing leg is dropped, never
      // patched from another leg, and it must not reach the basis check either:
      // a payload of all-null bars would otherwise be reported as a basis
      // failure, which points at a corporate action that did not happen.
      const complete = quotes.filter(
        (quote) =>
          quote.open !== null &&
          quote.high !== null &&
          quote.low !== null &&
          quote.close !== null,
      );

      if (complete.length === 0) {
        return { status: "empty", reason: "every returned bar was incomplete" };
      }

      // Intraday only: prove the series shares a price basis with the daily
      // series before any of it is trusted. Reuses the exact guard the reaction
      // pipeline already applies, so the two cannot diverge on what "same
      // basis" means.
      if (isIntraday(interval)) {
        const verdict = await verifyIntradayBasis(
          chart,
          symbol,
          complete,
          from,
          to,
        );
        if (verdict !== null) return verdict;
      }

      const candles: ProviderCandle[] = [];
      let volumeWithheld = 0;

      for (const quote of complete) {
        const session = classifySession(quote.date);
        const volume = normalizeProviderVolume(quote.volume, session);
        if (volume === null && quote.volume !== null) volumeWithheld += 1;

        candles.push({
          openTime: quote.date,
          open: quote.open as number,
          high: quote.high as number,
          low: quote.low as number,
          close: quote.close as number,
          volume,
          session,
        });
      }

      return {
        status: "ok",
        candles,
        priceBasis: YAHOO_BASIS[interval],
        // Yahoo does not disclose the factor applied to a given bar, and the
        // pipeline will not infer one. Null means undisclosed, which is not the
        // same claim as "no split occurred".
        adjustmentFactor: null,
        volumeWithheld,
      };
    },
  };
}

/**
 * Compare the intraday series against the daily series for the same sessions.
 *
 * Returns null when the two agree, or a rejection outcome when they do not.
 * A daily fetch that fails is *not* treated as agreement: without the reference
 * series there is no evidence the intraday bars are on the expected basis, and
 * this pipeline fails closed rather than assuming the benign case.
 */
async function verifyIntradayBasis(
  chart: NonNullable<YahooProviderOptions["chart"]>,
  symbol: string,
  intradayQuotes: readonly YahooQuote[],
  from: Date,
  to: Date,
): Promise<CandleFetchOutcome | null> {
  let dailyQuotes: YahooQuote[];
  try {
    const result = await chart(symbol, {
      // Widened so at least one full session overlaps even for a narrow
      // intraday window around a single release.
      period1: new Date(from.getTime() - 5 * DAY_MS),
      period2: new Date(to.getTime() + 5 * DAY_MS),
      interval: "1d",
    });
    dailyQuotes = result.quotes ?? [];
  } catch (error) {
    return {
      status: "provider_error",
      reason: `basis reference fetch failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  const toBasisCandles = (quotes: readonly YahooQuote[]): BasisCandle[] =>
    quotes.map((q) => ({ date: q.date, open: q.open, close: q.close }));

  const ratio = intradayDailyBasisRatio(
    toBasisCandles(intradayQuotes),
    toBasisCandles(dailyQuotes),
  );

  if (ratio === null) {
    return {
      status: "basis_rejected",
      ratio: Number.NaN,
      reason:
        "no overlapping session between the intraday and daily series, so the " +
        "price basis cannot be verified",
    };
  }

  if (!seriesShareBasis(ratio)) {
    return {
      status: "basis_rejected",
      ratio,
      reason:
        `intraday/daily basis ratio ${ratio.toFixed(4)} exceeds tolerance — ` +
        `the two series are on different price bases (typically an unadjusted ` +
        `intraday series against a split-adjusted daily one)`,
    };
  }

  return null;
}
