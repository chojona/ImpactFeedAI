/**
 * Server → chart transformation for the candlestick view.
 *
 * Pure and DOM-free, so the part that can silently lie — whether a bar exists,
 * whether a volume reading is a measurement, and where the release marker
 * lands relative to the bars — is unit-testable without a canvas.
 *
 * Nothing here fabricates a bar. There is no gap filling, no resampling and no
 * interpolation: the output series has exactly one entry per stored candle, in
 * the order the database returned them. A market closure appears in the chart
 * as the absence of bars, which is what actually happened.
 *
 * Times are emitted as **UTC epoch seconds**, unshifted. Lightweight Charts has
 * no timezone support and the common workaround is to add the local UTC offset
 * to every timestamp, which makes the series claim a time it does not have.
 * This module refuses to do that; the client formats labels in
 * America/New_York instead. See `MarketChart`.
 */
import type { Candle, CandleInterval } from "@/types/market";

/** Seconds since the Unix epoch, which is what Lightweight Charts consumes. */
export type UtcSeconds = number;

export interface ChartCandle {
  time: UtcSeconds;
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * A histogram point, or a deliberate hole in the histogram.
 *
 * A point with no `value` is Lightweight Charts' whitespace representation:
 * the time slot exists on the scale but nothing is drawn. That is exactly what
 * a null volume means — the bar traded, the provider withheld the quantity —
 * and it is why the volume series is never given a 0 to stand in for it.
 */
export interface ChartVolumePoint {
  time: UtcSeconds;
  value?: number;
  color?: string;
}

export interface EventMarker {
  /**
   * Bar the marker is drawn on. Lightweight Charts can only attach a marker to
   * a time present in the series, so a release that lands mid-bar is drawn on
   * the bar containing it.
   */
  anchorTime: UtcSeconds;
  /**
   * The real release instant, ISO 8601 UTC. Never rounded to `anchorTime` —
   * this is what the label, tooltip and screen-reader text quote.
   */
  releaseAtIso: string;
  /** True when the release does not coincide with the bar's open. */
  approximate: boolean;
  /** Seconds between the release and the bar it is drawn on. */
  offsetSeconds: number;
}

const toSeconds = (date: Date): UtcSeconds =>
  Math.floor(date.getTime() / 1000);

/**
 * Convert stored candles into chart series data.
 *
 * Assumes `getCandles` has already ordered by `openTime` ascending and filtered
 * to one price basis and the current ingestion version; this re-sorts defensively
 * because a chart fed out-of-order bars renders silently wrong rather than
 * throwing.
 */
export function toChartCandles(candles: readonly Candle[]): ChartCandle[] {
  return [...candles]
    .sort((a, b) => a.openTime.getTime() - b.openTime.getTime())
    .map((candle) => ({
      time: toSeconds(candle.openTime),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }));
}

export const UP_VOLUME_COLOR = "rgba(0, 255, 148, 0.35)";
export const DOWN_VOLUME_COLOR = "rgba(255, 92, 92, 0.35)";

/**
 * Volume series aligned one-to-one with the candles.
 *
 * A candle whose volume is null contributes a whitespace point rather than
 * being dropped, so the series length always equals the candle count and the
 * hole is explicit in the data rather than implied by an absence.
 */
export function toVolumePoints(
  candles: readonly Candle[],
): ChartVolumePoint[] {
  return [...candles]
    .sort((a, b) => a.openTime.getTime() - b.openTime.getTime())
    .map((candle) => {
      const time = toSeconds(candle.openTime);
      if (candle.volume === null || !Number.isFinite(candle.volume)) {
        // Whitespace: the bar exists, the quantity is unknown. Emitting 0 here
        // would draw a flat bar that asserts no trading occurred.
        return { time };
      }
      return {
        time,
        value: candle.volume,
        color:
          candle.close >= candle.open ? UP_VOLUME_COLOR : DOWN_VOLUME_COLOR,
      };
    });
}

/**
 * Locate the release instant among the bars.
 *
 * Returns the bar that *contains* the release — the last bar opening at or
 * before it. A release before the first bar or after the last one anchors to
 * the nearest end, because a marker outside the series is not rendered at all
 * and silently losing the most important annotation on the chart is worse than
 * drawing it at the edge; `approximate` and `offsetSeconds` let the caller say
 * so.
 *
 * Returns null only when there are no bars to anchor to.
 */
export function locateEventMarker(
  candles: readonly ChartCandle[],
  releaseAt: Date,
): EventMarker | null {
  if (candles.length === 0) return null;
  if (!Number.isFinite(releaseAt.getTime())) return null;

  const release = toSeconds(releaseAt);
  const releaseAtIso = releaseAt.toISOString();

  let anchor = candles[0].time;
  for (const candle of candles) {
    if (candle.time <= release) anchor = candle.time;
    else break;
  }

  return {
    anchorTime: anchor,
    releaseAtIso,
    approximate: anchor !== release,
    offsetSeconds: release - anchor,
  };
}

export interface ChartSeries {
  candles: ChartCandle[];
  volume: ChartVolumePoint[];
  marker: EventMarker | null;
  /** Bars whose volume the provider withheld. */
  volumeMissing: number;
  firstTime: UtcSeconds | null;
  lastTime: UtcSeconds | null;
}

/** Everything the client island needs, in one serializable object. */
export function buildChartSeries(
  candles: readonly Candle[],
  releaseAt: Date,
): ChartSeries {
  const chartCandles = toChartCandles(candles);
  const volume = toVolumePoints(candles);
  return {
    candles: chartCandles,
    volume,
    marker: locateEventMarker(chartCandles, releaseAt),
    volumeMissing: volume.filter((point) => point.value === undefined).length,
    firstTime: chartCandles[0]?.time ?? null,
    lastTime: chartCandles[chartCandles.length - 1]?.time ?? null,
  };
}

/* ─────────────────────────── accessible summary ─────────────────────────── */

const nyDateTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZoneName: "short",
});

/** Format a UTC instant in US Eastern, DST-aware. */
export const formatEastern = (date: Date): string =>
  nyDateTime.format(date).replace(",", "");

export interface ChartSummaryInput {
  symbol: string;
  interval: CandleInterval;
  intervalLabel: string;
  series: ChartSeries;
  releaseAt: Date;
  eventLabel: string;
}

/**
 * A prose description of the chart for screen readers.
 *
 * Deliberately a summary rather than a table of every bar: a canvas chart needs
 * an accessible equivalent, but dumping several hundred OHLC rows into the DOM
 * is not an equivalent, it is noise. The precise numbers a reader might want
 * are already available as text in the reaction table beside this chart.
 */
export function describeChart({
  symbol,
  intervalLabel,
  series,
  releaseAt,
  eventLabel,
}: ChartSummaryInput): string {
  if (series.candles.length === 0) {
    return `No stored ${intervalLabel} candles for ${symbol} around this release.`;
  }

  const first = series.candles[0];
  const last = series.candles[series.candles.length - 1];
  const at = (time: UtcSeconds) => formatEastern(new Date(time * 1000));
  const price = (value: number) => value.toFixed(2);
  const change = ((last.close - first.open) / first.open) * 100;

  const parts = [
    `${symbol} ${intervalLabel} candlestick chart.`,
    `${series.candles.length} bars from ${at(first.time)} to ${at(last.time)}.`,
    `First bar opened ${price(first.open)}; last bar closed ${price(last.close)}, ` +
      `a change of ${change > 0 ? "+" : ""}${change.toFixed(2)} percent across the window.`,
    `${eventLabel} released ${formatEastern(releaseAt)}.`,
  ];

  if (series.volumeMissing > 0) {
    parts.push(
      `Volume is unavailable for ${series.volumeMissing} of ${series.candles.length} bars ` +
        `because the data source does not report extended-hours volume; those bars show no volume rather than zero.`,
    );
  }

  return parts.join(" ");
}
