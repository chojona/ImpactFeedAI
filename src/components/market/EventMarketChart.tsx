import { MarketChart } from "./MarketChart";
import { MarketChartBoundary } from "./MarketChartBoundary";
import {
  buildChartSeries,
  describeChart,
  formatEastern,
} from "@/services/market/candleChart";
import {
  INTERVAL_CODE,
  loadEventCandles,
} from "@/services/market/candles";
import type { CandleInterval } from "@/types/market";

/**
 * The traded path around a release: real OHLC bars, on the clock.
 *
 * A Server Component. It performs the single database read, decides whether
 * there is anything to draw, and hands the client island a fully serialized
 * series. The island never queries anything — see `MarketChart`.
 *
 * This is deliberately a different artefact from `ReactionChart`, which plots
 * three measured horizons (1H / 1D / 1W) as discrete observations joined by
 * dashed connectors that are explicitly *not* observed. This one plots every
 * bar the database holds, in chronological order, and every mark on it is a
 * real observation. The two abstractions are kept apart on purpose: overlaying
 * reaction connectors on a candlestick chart would make an interpolation look
 * like a measurement.
 *
 * Scope is intentionally narrow for the first version — one symbol, one
 * interval, no controls — but `symbol` and `interval` are props, so widening it
 * later is a prop change rather than a rewrite.
 */

/** How far either side of the release to chart. */
const WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Measured hourly retention of the current provider. Quoted to the reader when
 * a release is too old to have candles, so the message explains the limit
 * rather than merely reporting the absence.
 */
const HOURLY_LOOKBACK_DAYS = 730;

interface Props {
  /** Release instant. The window is centred on this and the marker names it. */
  releaseAt: Date;
  /** Short label for the release, e.g. `CPI`. */
  eventLabel: string;
  symbol?: string;
  interval?: CandleInterval;
}

export async function EventMarketChart({
  releaseAt,
  eventLabel,
  symbol = "SPY",
  interval = "ONE_HOUR",
}: Props) {
  const intervalLabel = INTERVAL_CODE[interval].toUpperCase();

  const { candles, releaseAgeDays } = await loadEventCandles({
    symbol,
    interval,
    releaseAt,
    windowMs: WINDOW_MS,
  });

  if (candles.length === 0) {
    return (
      <MarketChartUnavailable
        symbol={symbol}
        intervalLabel={intervalLabel}
        ageDays={releaseAgeDays}
      />
    );
  }

  const series = buildChartSeries(candles, releaseAt);
  const description = describeChart({
    symbol,
    interval,
    intervalLabel,
    series,
    releaseAt,
    eventLabel,
  });

  return (
    <MarketChartBoundary fallback={<MarketChartFailed symbol={symbol} />}>
      <MarketChart
        symbol={symbol}
        intervalLabel={intervalLabel}
        candles={series.candles}
        volume={series.volume}
        marker={series.marker}
        eventLabel={eventLabel}
        eventTimeLabel={formatEastern(releaseAt)}
        description={description}
      />
    </MarketChartBoundary>
  );
}

/**
 * No stored bars for this release.
 *
 * A fact about coverage, not a failure. The provider's intraday history is a
 * rolling window — hourly bars survive about 730 days — so older events in the
 * library have no candles and never will from this source. Saying that plainly
 * is more useful than an empty chart frame, and it is the same posture the
 * reaction sections take when timing cannot be defended.
 */
export function MarketChartUnavailable({
  symbol,
  intervalLabel,
  ageDays,
}: {
  symbol: string;
  intervalLabel: string;
  /** Age of the release in days, resolved by the caller. */
  ageDays: number;
}) {
  const beyondWindow = ageDays > HOURLY_LOOKBACK_DAYS;

  return (
    <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.01] px-6 py-10 text-center">
      <h3 className="text-sm font-semibold text-zinc-300">
        Intraday chart unavailable
      </h3>
      <p className="mx-auto mt-2 max-w-lg text-[13px] leading-relaxed text-zinc-500">
        No stored {intervalLabel} candles for{" "}
        <span className="font-mono text-zinc-400">{symbol}</span> around this
        release.{" "}
        {beyondWindow ? (
          <>
            This release is {ageDays.toLocaleString()} days old and the current
            data source retains hourly history for roughly{" "}
            {HOURLY_LOOKBACK_DAYS} days, so these bars can no longer be
            retrieved from it.
          </>
        ) : (
          <>
            The candle backfill has not covered this release yet.
          </>
        )}
      </p>
      <p className="mx-auto mt-3 max-w-lg text-[12px] leading-relaxed text-zinc-600">
        The measured reaction below is unaffected — it is computed from stored
        window prices, not from these bars.
      </p>
    </div>
  );
}

/** The chart threw. An application fault, deliberately worded as one. */
function MarketChartFailed({ symbol }: { symbol: string }) {
  return (
    <div className="rounded-lg border border-amber-300/15 bg-amber-300/[0.02] px-6 py-10 text-center">
      <h3 className="text-sm font-semibold text-amber-200/90">
        Chart failed to render
      </h3>
      <p className="mx-auto mt-2 max-w-lg text-[13px] leading-relaxed text-amber-100/60">
        The {symbol} candles loaded, but the chart could not be drawn. This is
        an application error rather than a gap in the data — the reaction
        figures below are unaffected.
      </p>
    </div>
  );
}

/** Matches the chart's height so the section does not jump when it resolves. */
export function MarketChartSkeleton() {
  return (
    <div
      aria-hidden
      className="h-[340px] w-full animate-pulse rounded-lg border border-white/[0.06] bg-white/[0.02] sm:h-[400px] lg:h-[460px]"
    />
  );
}
