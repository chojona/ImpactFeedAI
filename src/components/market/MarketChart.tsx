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
 * `services/market/candleChart.ts`.
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
 */

const UP = "#00FF94";
const DOWN = "#FF5C5C";
const GRID = "rgba(255, 255, 255, 0.04)";
const TEXT = "#71717A";

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

const asDate = (time: Time): Date =>
  new Date((time as UTCTimestamp) * 1000);

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
        textColor: TEXT,
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 10,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: GRID },
        horzLines: { color: GRID },
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.08)",
        scaleMargins: { top: 0.08, bottom: 0.3 },
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: false,
        // Axis labels in US Eastern. The underlying values stay UTC.
        tickMarkFormatter: (time: Time) => {
          const date = asDate(time);
          return easternTime.format(date);
        },
      },
      localization: {
        // Crosshair label: include the day, since the window spans sessions.
        timeFormatter: (time: Time) => easternDayTime.format(asDate(time)),
      },
      crosshair: { mode: CrosshairMode.Normal },
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
      .applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
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
          color: "#FF6B35",
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
    <figure className="w-full">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm font-semibold text-zinc-100">
            {symbol}
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">
            · {intervalLabel}
          </span>
        </div>
        <div className="font-mono text-[10px] tabular-nums text-zinc-600">
          {spanLabel} · times in ET
        </div>
      </div>

      {/* The canvas carries no accessible information, so it is hidden and the
          summary beside it is the accessible representation. */}
      <div
        ref={containerRef}
        aria-hidden
        className="h-[280px] w-full sm:h-[340px] lg:h-[400px]"
      />

      <p className="sr-only">{description}</p>

      <figcaption className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-600">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-0 w-0 border-x-4 border-t-[6px] border-x-transparent"
            style={{ borderTopColor: "#FF6B35" }}
          />
          {eventLabel} release · {eventTimeLabel}
        </span>
        {marker?.approximate === true && (
          <span>Marker sits on the bar containing the release.</span>
        )}
        <span>Observed OHLC bars — not a reaction summary.</span>
      </figcaption>
    </figure>
  );
}
