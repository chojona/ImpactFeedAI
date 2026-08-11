"use client";

import { useEffect, useRef } from "react";
import {
  AreaSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";

import type { Direction, ReactionSeriesPoint } from "@/types/events";

/**
 * Reaction path for one asset: cumulative percent change from the event anchor
 * across the measured windows.
 *
 * Points are spaced evenly rather than by elapsed time, and the time axis is
 * hidden. That is a deliberate choice given what the schema stores: the windows
 * are 0h / 1h / 24h / 168h apart, so a time-proportional x-axis would squeeze
 * the anchor and the one-hour reading into the same pixel and devote 95% of the
 * width to the gap before the one-week point. The labels under the chart carry
 * the window identity instead.
 *
 * A true intraday replay needs candle-level history, which the schema does not
 * hold — see docs/roadmap.md.
 */

const COLORS: Record<Direction, { line: string; top: string; bottom: string }> = {
  UP: {
    line: "#00FF94",
    top: "rgba(0, 255, 148, 0.30)",
    bottom: "rgba(0, 255, 148, 0)",
  },
  DOWN: {
    line: "#FF4D4D",
    top: "rgba(255, 77, 77, 0.30)",
    bottom: "rgba(255, 77, 77, 0)",
  },
  FLAT: {
    line: "#A1A1AA",
    top: "rgba(161, 161, 170, 0.25)",
    bottom: "rgba(161, 161, 170, 0)",
  },
};

interface Props {
  points: readonly ReactionSeriesPoint[];
  direction: Direction;
  height?: number;
}

export function ReactionSparkline({ points, direction, height = 96 }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const colors = COLORS[direction];

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: "#080C10" },
        textColor: "#52525b",
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      timeScale: { visible: false, borderVisible: false },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.18, bottom: 0.12 },
      },
      crosshair: {
        vertLine: { visible: false },
        horzLine: { visible: false },
      },
      handleScroll: false,
      handleScale: false,
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: colors.line,
      topColor: colors.top,
      bottomColor: colors.bottom,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      const w = container.clientWidth;
      if (w > 0) {
        chart.applyOptions({ width: w });
        chart.timeScale().fitContent();
      }
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [colors.line, colors.top, colors.bottom, height]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || points.length === 0) return;

    // Index-based timestamps: even spacing, hidden axis. Any strictly
    // increasing sequence satisfies lightweight-charts.
    series.setData(
      points.map((p, i) => ({
        time: (i * 3600) as UTCTimestamp,
        value: p.value,
      })),
    );
    chart.timeScale().fitContent();
  }, [points]);

  return (
    <div className="relative w-full" style={{ height }}>
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  );
}
