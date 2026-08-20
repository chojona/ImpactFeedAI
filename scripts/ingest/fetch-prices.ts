/**
 * Yahoo Finance price fetcher.
 *
 * Calculation version 2 measures every reaction from a price observed before
 * the verified release instant. A first-post-release candle is an endpoint,
 * never a baseline: using it as both silently discards the opening move caused
 * by pre-market and weekend releases.
 *
 * Baseline order:
 *
 *   1. The most recent usable intraday candle whose timestamp is strictly
 *      before `releaseAt`, provided it is no more than two hours old.
 *   2. The immediately preceding session's daily close, provided the provider
 *      bar is no more than four calendar days old.
 *
 * The daily fallback is deliberately narrow. It admits ordinary weekends and
 * long weekends, but rejects an old close after a prolonged data gap. Its
 * `anchorAt` is Yahoo's timestamp for the daily bar (normally the session-open
 * stamp), because the daily payload does not carry a separately auditable close
 * timestamp. The price is the session close; consumers must treat `anchorAt` as
 * the source-bar identifier in this fallback case, not an exact closing tick.
 * Regular-session assumptions also cannot model early closes or extended-hours
 * trading. Those limitations are preferable to fabricating precision.
 *
 * Endpoints are release-relative rather than baseline-relative:
 *
 *   - 1h: first intraday open at/after releaseAt + one hour, within a bounded
 *     provider-gap tolerance.
 *   - 1d: first priced session after the release session.
 *   - 1w: first priced session at least seven calendar days after the release
 *     session.
 *
 * For a pre-market release the prior close remains in the denominator while
 * the event day defines the release session. For a weekend release, Friday's
 * close remains the denominator and Monday is the release session. The gap
 * caused by the event is therefore included rather than thrown away.
 */
import YahooFinance from "yahoo-finance2";

import type { PriceSnapshot } from "./types";

// In v3+, yahoo-finance2 deprecated the singleton form (calling the import
// directly). Instantiate once and reuse.
const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey", "ripHistorical"],
});

export interface Candle {
  /** Provider timestamp for the bar. Yahoo timestamps daily bars at the open. */
  date: Date;
  open: number | null;
  close: number | null;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const INTRADAY_HORIZON_MS = 720 * DAY_MS; // Yahoo keeps ~2y of 1h candles

/** Maximum age of an intraday price that may serve as a pre-release baseline. */
export const INTRADAY_BASELINE_MAX_AGE_MS = 2 * HOUR_MS;

/**
 * Maximum provider-bar age for a prior-session close fallback. Four days
 * admits a Friday bar for a Tuesday release after a Monday market holiday.
 */
export const PRIOR_SESSION_BASELINE_MAX_AGE_MS = 4 * DAY_MS;

/**
 * How far after the +1h target an intraday bar may sit and still represent that
 * window. This tolerates one missing hourly bar but rejects an overnight jump.
 */
export const INTRADAY_ENDPOINT_SLIP_MS = 2 * HOUR_MS;

const newYorkDayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const usablePrice = (value: number | null): number | null =>
  value !== null && Number.isFinite(value) && value > 0 ? value : null;

/** Intraday timestamps identify the bar open, so only its open is time-safe. */
const intradayPrice = (candle: Candle): number | null =>
  usablePrice(candle.open);

/** Daily endpoints retain the existing session-open convention. */
const dailyEndpointPrice = (candle: Candle): number | null =>
  usablePrice(candle.open);

/** A daily fallback is explicitly a close; it never silently substitutes open. */
const dailyBaselinePrice = (candle: Candle): number | null =>
  usablePrice(candle.close);

/** UTC calendar day of a daily candle stamped during its US session. */
const sessionDay = (candle: Candle): string =>
  candle.date.toISOString().slice(0, 10);

/** New York calendar day containing an exact release instant. */
function releaseDay(releaseAt: Date): string {
  const parts = newYorkDayFormatter.formatToParts(releaseAt);
  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

const addDaysIso = (iso: string, days: number): string => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

function sortedValidCandles(candles: readonly Candle[]): Candle[] {
  return candles
    .filter((candle) => Number.isFinite(candle.date.getTime()))
    .slice()
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Most recent usable, sufficiently fresh intraday open before the release. */
function recentIntradayBaseline(
  intraday: readonly Candle[],
  releaseAt: Date,
): { price: number; anchorAt: Date } | null {
  const releaseMs = releaseAt.getTime();
  for (let index = intraday.length - 1; index >= 0; index -= 1) {
    const candle = intraday[index];
    const candleMs = candle.date.getTime();
    if (candleMs >= releaseMs) continue;
    if (releaseMs - candleMs > INTRADAY_BASELINE_MAX_AGE_MS) return null;
    const price = intradayPrice(candle);
    if (price !== null) return { price, anchorAt: candle.date };
  }
  return null;
}

/**
 * Close of the immediately preceding daily session, when fresh enough.
 *
 * Requiring a strictly earlier New York session day ensures a same-day daily
 * close can never leak post-release information into a mid-session baseline.
 * For an after-hours release, a recent intraday open remains the preferred
 * baseline; without intraday coverage we conservatively fall back one session.
 */
function priorSessionBaseline(
  daily: readonly Candle[],
  releaseAt: Date,
): { price: number; anchorAt: Date } | null {
  const day = releaseDay(releaseAt);
  let candidate: Candle | null = null;
  for (const candle of daily) {
    if (sessionDay(candle) >= day) break;
    candidate = candle;
  }
  if (candidate === null) return null;
  if (
    releaseAt.getTime() - candidate.date.getTime() >
    PRIOR_SESSION_BASELINE_MAX_AGE_MS
  ) {
    return null;
  }
  const price = dailyBaselinePrice(candidate);
  return price === null ? null : { price, anchorAt: candidate.date };
}

/** First usable intraday open at/after a target, within the allowed slip. */
function intradayEndpoint(
  intraday: readonly Candle[],
  target: Date,
): number | null {
  const targetMs = target.getTime();
  for (const candle of intraday) {
    const candleMs = candle.date.getTime();
    if (candleMs < targetMs) continue;
    if (candleMs - targetMs > INTRADAY_ENDPOINT_SLIP_MS) return null;
    const price = intradayPrice(candle);
    if (price !== null) return price;
  }
  return null;
}

/**
 * Daily session containing the release date, or the first session after it for
 * a weekend/holiday release. The row need not itself have a usable price: it
 * still defines which trading session the event belongs to.
 */
function releaseSessionIndex(
  daily: readonly Candle[],
  releaseAt: Date,
): number {
  const day = releaseDay(releaseAt);
  return daily.findIndex((candle) => sessionDay(candle) >= day);
}

/** First usable daily open strictly after `fromIndex`. */
function nextSessionPrice(
  daily: readonly Candle[],
  fromIndex: number,
): number | null {
  for (let index = fromIndex + 1; index < daily.length; index += 1) {
    const price = dailyEndpointPrice(daily[index]);
    if (price !== null) return price;
  }
  return null;
}

/** First usable daily open on or after a calendar-day target. */
function priceOnOrAfterSessionDay(
  daily: readonly Candle[],
  fromIndex: number,
  targetDay: string,
): number | null {
  for (let index = fromIndex + 1; index < daily.length; index += 1) {
    if (sessionDay(daily[index]) < targetDay) continue;
    const price = dailyEndpointPrice(daily[index]);
    if (price !== null) return price;
  }
  return null;
}

/**
 * How far the intraday and daily series may disagree before they are treated as
 * quoted on different bases. Same-session opens should be near-identical; five
 * percent absorbs bar-boundary noise without admitting a corporate action.
 */
export const SERIES_BASIS_TOLERANCE = 0.05;

/**
 * Median ratio between the intraday and daily quote for the same session.
 *
 * Yahoo applies split adjustments to its daily bars but serves intraday bars
 * unadjusted, so after a share split the two series describe the same security
 * at different scales. XLK and XLE both split 2:1, and a return taken from an
 * intraday baseline against a daily endpoint reported roughly −50% on every
 * event inside the intraday window — a fabricated move that looks exactly like
 * a real one.
 *
 * Returns null when the series do not overlap, which is the normal case for an
 * event older than the provider's intraday horizon.
 */
export function intradayDailyBasisRatio(
  intraday: readonly Candle[],
  daily: readonly Candle[],
): number | null {
  const dailyOpenByDay = new Map<string, number>();
  for (const candle of daily) {
    const open = usablePrice(candle.open);
    if (open !== null) dailyOpenByDay.set(sessionDay(candle), open);
  }

  const ratios: number[] = [];
  const seen = new Set<string>();
  for (const candle of intraday) {
    const day = sessionDay(candle);
    if (seen.has(day)) continue;
    const dailyOpen = dailyOpenByDay.get(day);
    const price = intradayPrice(candle);
    if (dailyOpen === undefined || price === null) continue;
    seen.add(day);
    ratios.push(price / dailyOpen);
  }

  if (ratios.length === 0) return null;
  ratios.sort((a, b) => a - b);
  return ratios[Math.floor(ratios.length / 2)];
}

/** Whether both series may contribute to one return. */
export const seriesShareBasis = (ratio: number | null): boolean =>
  ratio === null || Math.abs(ratio - 1) <= SERIES_BASIS_TOLERANCE;

/**
 * Pure window resolution — the part tested without provider or database I/O.
 * Returns null when no bounded, strictly pre-release baseline exists.
 */
export function resolvePriceSnapshot(
  intradayCandles: readonly Candle[],
  dailyCandles: readonly Candle[],
  releaseAt: Date,
): PriceSnapshot | null {
  if (!Number.isFinite(releaseAt.getTime())) return null;

  const intraday = sortedValidCandles(intradayCandles);
  const daily = sortedValidCandles(dailyCandles);

  // A percent change is only meaningful when its numerator and denominator are
  // quoted on the same basis. When the provider's two series disagree, the
  // intraday one is discarded entirely rather than mixed: that costs the 1h
  // window but keeps 1d and 1w internally consistent, which is the same
  // daily-only footing an event older than the intraday horizon already uses.
  const basisRatio = intradayDailyBasisRatio(intraday, daily);
  const consistent = seriesShareBasis(basisRatio);
  const usableIntraday = consistent ? intraday : [];

  const baseline =
    recentIntradayBaseline(usableIntraday, releaseAt) ??
    priorSessionBaseline(daily, releaseAt);
  if (baseline === null) return null;

  const price1h = intradayEndpoint(
    usableIntraday,
    new Date(releaseAt.getTime() + HOUR_MS),
  );

  let price1d: number | null = null;
  let price1w: number | null = null;
  const releaseSessionIdx = releaseSessionIndex(daily, releaseAt);
  if (releaseSessionIdx !== -1) {
    price1d = nextSessionPrice(daily, releaseSessionIdx);
    const weekTargetDay = addDaysIso(
      sessionDay(daily[releaseSessionIdx]),
      7,
    );
    price1w = priceOnOrAfterSessionDay(
      daily,
      releaseSessionIdx,
      weekTargetDay,
    );
  }

  return {
    priceAtEvent: baseline.price,
    anchorAt: baseline.anchorAt,
    price1h,
    price1d,
    price1w,
  };
}

/**
 * Fetch a price snapshot around one verified release instant.
 *
 * Returns null unless a bounded pre-release baseline can be sourced. Individual
 * endpoints remain nullable when their provider windows are unavailable.
 */
export async function fetchPriceSnapshot(
  symbol: string,
  releaseAt: Date,
): Promise<PriceSnapshot | null> {
  const ageMs = Date.now() - releaseAt.getTime();
  const intradayAvailable = ageMs >= 0 && ageMs < INTRADAY_HORIZON_MS;

  let intradayCandles: Candle[] = [];
  if (intradayAvailable) {
    try {
      const result = await yahooFinance.chart(symbol, {
        // Include one extra bar so the two-hour baseline boundary is present.
        period1: new Date(
          releaseAt.getTime() - INTRADAY_BASELINE_MAX_AGE_MS - HOUR_MS,
        ),
        period2: new Date(releaseAt.getTime() + 12 * HOUR_MS),
        interval: "1h",
        return: "array",
      });
      intradayCandles = result.quotes.map((quote) => ({
        date: quote.date,
        open: quote.open,
        close: quote.close,
      }));
    } catch (error) {
      logSymbolWarning(symbol, "intraday fetch failed", error);
    }
  }

  let dailyCandles: Candle[] = [];
  try {
    const result = await yahooFinance.chart(symbol, {
      // Include one extra day around the four-day fallback boundary and enough
      // forward sessions to survive weekends and holidays at the 1w endpoint.
      period1: new Date(
        releaseAt.getTime() - PRIOR_SESSION_BASELINE_MAX_AGE_MS - DAY_MS,
      ),
      period2: new Date(releaseAt.getTime() + 21 * DAY_MS),
      interval: "1d",
      return: "array",
    });
    dailyCandles = result.quotes.map((quote) => ({
      date: quote.date,
      open: quote.open,
      close: quote.close,
    }));
  } catch (error) {
    logSymbolWarning(symbol, "daily fetch failed", error);
  }

  return resolvePriceSnapshot(intradayCandles, dailyCandles, releaseAt);
}

function logSymbolWarning(symbol: string, message: string, error: unknown): void {
  const detail = error instanceof Error ? error.message : String(error);
  console.warn(`  ⚠ ${symbol}: ${message} — ${detail}`);
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
