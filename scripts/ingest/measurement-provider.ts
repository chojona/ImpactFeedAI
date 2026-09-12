/**
 * Yahoo adapter for the v3 measurement engine.
 *
 * Returns the two series the engine needs with their bases DECLARED, and maps
 * provider stamps onto US-Eastern session days. It performs no measurement
 * logic: every decision that could misrepresent data lives in
 * `src/services/events/reactionMeasurement.ts`.
 *
 * Per spec §15.2, the old v2 cross-series `intradayDailyBasisRatio` check is
 * demoted here to a reported diagnostic (`basisRatio`) rather than a
 * precondition: v3 never mixes the two series within one measurement, so an
 * instrument's differing intraday-vs-daily basis declarations can no longer
 * suppress a valid reading.
 */
import YahooFinance from "yahoo-finance2";

import type {
  DailyBar,
  IntradayBar,
} from "@/services/events/reactionMeasurement";
import type { PriceBasis } from "@/types/market";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey", "ripHistorical"],
});

/** Measured against the provider; see prisma/schema.prisma PriceBasis. */
export const YAHOO_DAILY_BASIS: PriceBasis = "SPLIT_ADJUSTED";
export const YAHOO_INTRADAY_BASIS: PriceBasis = "AS_TRADED";

const DAY_MS = 86_400_000;
const INTRADAY_HORIZON_MS = 720 * DAY_MS;

const sessionDayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** US-Eastern calendar day of a provider bar stamp, YYYY-MM-DD. */
export const toSessionDay = (barAt: Date): string =>
  sessionDayFormat.format(barAt);

export interface SeriesFetchResult {
  daily: DailyBar[];
  dailyBasis: PriceBasis;
  intraday: IntradayBar[];
  /** Null when the two series do not overlap. Diagnostic only — see §15.2. */
  basisRatio: number | null;
}

export type SeriesFetchOutcome =
  | { status: "ok"; series: SeriesFetchResult }
  | { status: "failed"; reason: string };

export interface MeasurementSeriesProvider {
  readonly id: string;
  fetchSeries(args: {
    symbol: string;
    releaseAt: Date;
  }): Promise<SeriesFetchOutcome>;
}

/**
 * Median ratio between the intraday and daily open for the same session,
 * where both are present. Reported for operator visibility only — it is
 * never used to accept or reject a measurement.
 */
function diagnosticBasisRatio(
  daily: readonly DailyBar[],
  intraday: readonly IntradayBar[],
): number | null {
  const dailyCloseByDay = new Map<string, number>();
  for (const bar of daily) {
    if (bar.close !== null && Number.isFinite(bar.close) && bar.close > 0) {
      dailyCloseByDay.set(bar.sessionDay, bar.close);
    }
  }

  const ratios: number[] = [];
  const seen = new Set<string>();
  for (const bar of intraday) {
    const day = toSessionDay(bar.barAt);
    if (seen.has(day)) continue;
    const dailyClose = dailyCloseByDay.get(day);
    if (
      dailyClose === undefined ||
      bar.open === null ||
      !Number.isFinite(bar.open) ||
      bar.open <= 0
    ) {
      continue;
    }
    seen.add(day);
    ratios.push(bar.open / dailyClose);
  }

  if (ratios.length === 0) return null;
  ratios.sort((a, b) => a - b);
  return ratios[Math.floor(ratios.length / 2)];
}

export function createYahooMeasurementProvider(): MeasurementSeriesProvider {
  return {
    id: "yahoo-finance2@3.14.0",
    async fetchSeries({ symbol, releaseAt }) {
      let daily: DailyBar[] = [];
      try {
        const res = await yahooFinance.chart(symbol, {
          // Wide enough for a prior-session anchor across a long weekend and
          // a +5-session endpoint across holidays.
          period1: new Date(releaseAt.getTime() - 20 * DAY_MS),
          period2: new Date(releaseAt.getTime() + 30 * DAY_MS),
          interval: "1d",
          return: "array",
        });
        daily = res.quotes.map((q) => ({
          sessionDay: toSessionDay(q.date),
          barAt: q.date,
          close: q.close,
        }));
      } catch (error) {
        return {
          status: "failed",
          reason: `daily fetch failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
      }

      const age = Date.now() - releaseAt.getTime();
      let intraday: IntradayBar[] = [];
      if (age >= 0 && age < INTRADAY_HORIZON_MS) {
        try {
          const res = await yahooFinance.chart(symbol, {
            period1: new Date(releaseAt.getTime() - 4 * 3_600_000),
            period2: new Date(releaseAt.getTime() + 12 * 3_600_000),
            interval: "1h",
            return: "array",
          });
          intraday = res.quotes.map((q) => ({
            barAt: q.date,
            open: q.open,
            priceBasis: YAHOO_INTRADAY_BASIS,
          }));
        } catch {
          // Intraday is optional: its absence removes INTRADAY_60M and
          // leaves every session measure untouched.
          intraday = [];
        }
      }

      return {
        status: "ok",
        series: {
          daily,
          dailyBasis: YAHOO_DAILY_BASIS,
          intraday,
          basisRatio: diagnosticBasisRatio(daily, intraday),
        },
      };
    },
  };
}
