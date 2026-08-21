import { MarketChart } from "./MarketChart";
import { MarketChartBoundary } from "./MarketChartBoundary";
import { DataStatePanel } from "@/components/ui/DataStatePanel";
import {
  buildChartSeries,
  describeChart,
  formatEastern,
} from "@/services/market/candleChart";
import { INTERVAL_CODE, loadEventCandles } from "@/services/market/candles";
import type { CandleInterval } from "@/types/market";

/**
 * The traded path around a release: real OHLC bars, on the clock.
 *
 * A Server Component. It performs the single database read, decides whether
 * there is anything to draw, resolves the summary figures the chart frame
 * quotes, and hands the client island a fully serialized series. The island
 * never queries anything — see `MarketChart`.
 *
 * This is deliberately a different artefact from `ReactionChart`, which plots
 * three measured horizons (1H / 1D / 1W) as discrete observations joined by
 * dashed connectors that are explicitly *not* observed. This one plots every
 * bar the database holds, in chronological order, and every mark on it is a
 * real observation. The two abstractions are kept apart on purpose: overlaying
 * reaction connectors on a candlestick chart would make an interpolation look
 * like a measurement.
 *
 * The high and low are computed here rather than in the island so the client
 * receives finished numbers, consistent with everything else it is given.
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

  // Extremes of the bars actually on screen. Null-safe by construction: the
  // series is non-empty here, and `reduce` over the highs and lows never
  // invents a value the way a default of 0 would.
  const high = series.candles.reduce(
    (max: number | null, c) => (max === null || c.high > max ? c.high : max),
    null,
  );
  const low = series.candles.reduce(
    (min: number | null, c) => (min === null || c.low < min ? c.low : min),
    null,
  );

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
        high={high}
        low={low}
        volumeMissing={series.volumeMissing}
      />
    </MarketChartBoundary>
  );
}

/**
 * No stored bars for this release.
 *
 * A fact about coverage, not a failure — and which *kind* of coverage fact is
 * the whole message. Beyond the provider's rolling intraday window these bars
 * can never be retrieved from this source (`unsupported`); inside it, the
 * backfill simply has not run yet (`pending`). Those are a permanent limit and
 * a queued task, and the previous single grey box said neither.
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
    <DataStatePanel
      state={beyondWindow ? "unsupported" : "pending"}
      title={
        beyondWindow
          ? "Intraday bars no longer retrievable"
          : "Intraday bars not ingested yet"
      }
      minHeight="chart"
      footnote="The measured reaction below is unaffected — it is computed from stored window prices, not from these bars."
    >
      No stored {intervalLabel} candles for{" "}
      <span className="num text-ink-2">{symbol}</span> around this release.{" "}
      {beyondWindow ? (
        <>
          This release is {ageDays.toLocaleString()} days old and the current
          data source retains hourly history for roughly {HOURLY_LOOKBACK_DAYS}{" "}
          days, so these bars can no longer be retrieved from it.
        </>
      ) : (
        <>The candle backfill has not covered this release yet.</>
      )}
    </DataStatePanel>
  );
}

/** The chart threw. An application fault, deliberately worded as one. */
function MarketChartFailed({ symbol }: { symbol: string }) {
  return (
    <DataStatePanel
      state="error"
      title="Chart failed to render"
      minHeight="chart"
      footnote="This is an application error rather than a gap in the data — the reaction figures below are unaffected."
    >
      The {symbol} candles loaded, but the chart could not be drawn.
    </DataStatePanel>
  );
}

/** Matches the chart's height so the section does not jump when it resolves. */
export function MarketChartSkeleton() {
  return (
    <div
      aria-hidden
      className="overflow-hidden rounded-lg border border-line bg-surface-1"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
        <div className="h-4 w-28 animate-pulse rounded bg-white/[0.05]" />
        <div className="h-3 w-32 animate-pulse rounded bg-white/[0.04]" />
      </div>
      <div className="grid grid-cols-3 gap-4 px-4 py-3 sm:px-5">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i}>
            <div className="h-2 w-16 animate-pulse rounded bg-white/[0.04]" />
            <div className="mt-2 h-3.5 w-20 animate-pulse rounded bg-white/[0.05]" />
          </div>
        ))}
      </div>
      <div className="h-[300px] animate-pulse bg-white/[0.02] sm:h-[360px] lg:h-[430px]" />
    </div>
  );
}
