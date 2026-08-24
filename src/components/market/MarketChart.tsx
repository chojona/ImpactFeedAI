"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";

import { Badge } from "@/components/ui/Badge";
import { MetricCell } from "@/components/ui/Metric";
import type {
  ChartCandle,
  ChartVolumePoint,
  EventMarker,
} from "@/services/market/candleChart";

/**
 * The Lightweight Charts rendering island.
 *
 * This is the **only** module in the application that imports
 * `lightweight-charts`, so the library is code-split into this component's
 * chunk and never reaches a page that does not render a chart.
 *
 * It receives fully serialized, already-validated data. It performs no
 * fetching, knows nothing about Prisma, providers or price bases, and does not
 * transform the series beyond handing it to the library — every decision that
 * could misrepresent the data was made on the server in
 * `services/market/candleChart.ts` or in `EventMarketChart`.
 *
 * ### Timezone
 *
 * Timestamps arrive as true UTC epoch seconds and are **not** shifted. The
 * widespread workaround for this library's lack of timezone support is to add
 * the local UTC offset to every value, which makes the series assert a time it
 * does not have and quietly breaks across a DST boundary. Instead the axis and
 * crosshair are formatted through `Intl.DateTimeFormat` in America/New_York,
 * which is DST-correct by construction and matches how the rest of the app
 * renders event times.
 *
 * ### What the redesign changed
 *
 * The chart used to be a bare canvas under a one-line label: the reader could
 * see a shape but had to hover to learn a single number, and the axis type was
 * 10px at roughly 3:1 contrast. It now carries a stat strip — charted span,
 * observed high and low, bar count — so the frame states what is being shown
 * before the canvas is interpreted, plus larger and higher-contrast axis type
 * and a taller box.
 *
 * The strip deliberately reports **no percentage**. The page already quotes
 * anchored 1H/1D/1W returns measured from the pre-release bar, and a
 * "first open → last close" figure computed over an arbitrary ±24h charting
 * window is a different measurement that would sit beside them looking like a
 * contradiction. High, low and span are facts about the bars on screen and
 * cannot be confused for a reaction.
 */

const UP = "#00FF94";
const DOWN = "#FF5C5C";
/** Blue-tinted so the grid belongs to the navy plot field rather than to a
    neutral grey chart pasted onto it. */
const GRID = "rgba(150, 176, 255, 0.07)";
/** Matches `--color-ink-4`. */
const AXIS_TEXT = "#737F99";
const AXIS_LINE = "rgba(150, 176, 255, 0.18)";
/** `--color-surface-4`, so the crosshair label matches an elevated surface. */
const CROSSHAIR_LABEL = "#2C3A52";
/** The release marker keeps the product's orange: it is the one annotation on
    the chart that is neither a price nor a direction, so it gets its own hue. */
const RELEASE_MARK = "#FF8A4C";

const easternTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit",
  hour12: false,
});

const easternDayTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: false,
});

const easternDay = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
});

/** New York calendar day of a UTC instant, used to detect a day rollover. */
const easternDayKey = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const asDate = (time: Time): Date => new Date((time as UTCTimestamp) * 1000);

const price = (value: number): string =>
  value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

interface Props {
  symbol: string;
  /** Display label for the interval, e.g. `1H`. */
  intervalLabel: string;
  candles: readonly ChartCandle[];
  volume: readonly ChartVolumePoint[];
  marker: EventMarker | null;
  /** Short label for the release, e.g. `CPI`. */
  eventLabel: string;
  /** Release instant in US Eastern, pre-formatted on the server. */
  eventTimeLabel: string;
  /** Accessible description; the canvas itself is hidden from the a11y tree. */
  description: string;
  /** Highest high across the charted bars. Resolved on the server. */
  high: number | null;
  /** Lowest low across the charted bars. Resolved on the server. */
  low: number | null;
  /** Bars whose volume the provider withheld. Rendered as a caveat, not a 0. */
  volumeMissing: number;
}

export function MarketChart({
  symbol,
  intervalLabel,
  candles,
  volume,
  marker,
  eventLabel,
  eventTimeLabel,
  description,
  high,
  low,
  volumeMissing,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    const chart = createChart(container, {
      // Sized from the container on the first frame and by ResizeObserver
      // afterwards; never a hardcoded desktop width.
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: AXIS_TEXT,
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: GRID },
        horzLines: { color: GRID },
      },
      rightPriceScale: {
        borderColor: AXIS_LINE,
        scaleMargins: { top: 0.08, bottom: 0.28 },
      },
      timeScale: {
        borderColor: AXIS_LINE,
        timeVisible: true,
        secondsVisible: false,
        // Room for an 11px label without the axis dropping every other tick.
        minBarSpacing: 4,
        // Axis labels in US Eastern. The underlying values stay UTC.
        tickMarkFormatter: (time: Time) => easternTime.format(asDate(time)),
      },
      localization: {
        // Crosshair label: include the day, since the window spans sessions.
        timeFormatter: (time: Time) => easternDayTime.format(asDate(time)),
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(150, 176, 255, 0.45)",
          labelBackgroundColor: CROSSHAIR_LABEL,
        },
        horzLine: {
          color: "rgba(150, 176, 255, 0.45)",
          labelBackgroundColor: CROSSHAIR_LABEL,
        },
      },
      handleScale: { axisPressedMouseMove: false },
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    // The service emits plain epoch-second numbers so it stays free of any
    // charting-library types; the brand is applied here, at the boundary.
    candleSeries.setData(
      candles.map((c) => ({ ...c, time: c.time as UTCTimestamp })),
    );

    // Volume shares the pane but is pinned to the lower third on its own
    // invisible scale, so a large volume bar cannot compress the price series.
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      priceLineVisible: false,
      lastValueVisible: false,
    });
    chart
      .priceScale("volume")
      .applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    // Whitespace points (no `value`) render as gaps — a bar with unknown
    // volume draws nothing rather than a zero-height bar.
    volumeSeries.setData(
      volume.map((v) => ({ ...v, time: v.time as UTCTimestamp })),
    );

    if (marker !== null) {
      createSeriesMarkers(candleSeries, [
        {
          time: marker.anchorTime as UTCTimestamp,
          position: "aboveBar",
          shape: "arrowDown",
          color: RELEASE_MARK,
          // The label always quotes the true release time, even though the
          // marker is drawn on the bar containing it.
          text: `${eventLabel} ${eventTimeLabel}`,
        },
      ]);
    }

    chart.timeScale().fitContent();

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry === undefined) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) chart.applyOptions({ width, height });
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, volume, marker, eventLabel, eventTimeLabel]);

  const first = candles[0];
  const last = candles[candles.length - 1];
  const spanLabel =
    first === undefined || last === undefined
      ? null
      : (() => {
          const from = easternDay.format(new Date(first.time * 1000));
          const to = easternDay.format(new Date(last.time * 1000));
          const sameDay =
            easternDayKey.format(new Date(first.time * 1000)) ===
            easternDayKey.format(new Date(last.time * 1000));
          return sameDay ? from : `${from} – ${to}`;
        })();

  return (
    <figure className="surface-lift w-full overflow-hidden rounded-lg border border-line bg-surface-1">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="num text-sm font-semibold text-ink">{symbol}</span>
          <Badge size="xs">{intervalLabel} bars</Badge>
          <span className="text-[11px] text-ink-3">Observed OHLC</span>
        </div>
        <div className="num text-[11px] text-ink-4">
          {spanLabel} · times in ET
        </div>
      </div>

      <dl className="grid grid-cols-3 divide-line px-4 py-3 sm:divide-x sm:px-5">
        <MetricCell
          label="Observed high"
          value={high === null ? null : price(high)}
          size="sm"
          state="unavailable"
          className="sm:pl-0"
        />
        <MetricCell
          label="Observed low"
          value={low === null ? null : price(low)}
          size="sm"
          state="unavailable"
        />
        <MetricCell
          label="Bars charted"
          value={String(candles.length)}
          size="sm"
          state="measured"
          note={
            volumeMissing > 0
              ? `${volumeMissing} without reported volume`
              : undefined
          }
          noteTone={volumeMissing > 0 ? "caution" : "muted"}
        />
      </dl>

      {/* The canvas carries no accessible information, so it is hidden and the
          summary beside it is the accessible representation. */}
      {/* The plot sits in its own sunken, faintly blue field. It separates the
          measurement space from the frame around it and raises the perceived
          contrast of every gridline and candle without altering a colour. */}
      <div className="plot-field border-y border-line">
        <div
          ref={containerRef}
          aria-hidden
          className="h-[300px] w-full sm:h-[360px] lg:h-[430px]"
        />
      </div>

      <p className="sr-only">{description}</p>

      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line px-4 py-2.5 text-[11px] text-ink-3 sm:px-5">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-0 w-0 border-x-4 border-t-[6px] border-x-transparent"
            style={{ borderTopColor: RELEASE_MARK }}
          />
          {eventLabel} release · {eventTimeLabel}
        </span>
        {marker?.approximate === true && (
          <span className="text-ink-4">
            Marker sits on the bar containing the release.
          </span>
        )}
        <span className="text-ink-4">
          Every bar is an observation — this is not a reaction summary.
        </span>
      </figcaption>
    </figure>
  );
}
