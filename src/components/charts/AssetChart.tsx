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
import type { ChartDataPoint, Direction } from "@/lib/types";

type ReplaySpeed = 1 | 2 | 5 | 10;

interface Props {
  symbol: string;
  data: ChartDataPoint[];
  percentChange: number;
  direction: Direction;
  eventTime: string;
  replayMode?: boolean;
  replaySpeed?: ReplaySpeed;
  replayKey?: number;
}

const COLORS: Record<
  Direction,
  { line: string; top: string; bottom: string; text: string }
> = {
  UP: {
    line: "#00FF94",
    top: "rgba(0, 255, 148, 0.30)",
    bottom: "rgba(0, 255, 148, 0)",
    text: "text-[#00FF94]",
  },
  DOWN: {
    line: "#FF4D4D",
    top: "rgba(255, 77, 77, 0.30)",
    bottom: "rgba(255, 77, 77, 0)",
    text: "text-red-400",
  },
  FLAT: {
    line: "#A1A1AA",
    top: "rgba(161, 161, 170, 0.25)",
    bottom: "rgba(161, 161, 170, 0)",
    text: "text-zinc-400",
  },
};

const toLwTime = (iso: string): UTCTimestamp =>
  Math.floor(new Date(iso).getTime() / 1000) as UTCTimestamp;

export function AssetChart({
  symbol,
  data,
  percentChange,
  direction,
  eventTime,
  replayMode = false,
  replaySpeed = 5,
  replayKey = 0,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lineRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const eventTimeRef = useRef(eventTime);
  eventTimeRef.current = eventTime;

  const colors = COLORS[direction];
  const sign = percentChange > 0 ? "+" : "";

  // Mount: create chart, series, resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 160,
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
        scaleMargins: { top: 0.15, bottom: 0.05 },
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

    const repositionLine = () => {
      const el = lineRef.current;
      if (!el) return;
      const x = chart.timeScale().timeToCoordinate(toLwTime(eventTimeRef.current));
      if (x === null || Number.isNaN(x)) return;
      el.style.transform = `translateX(${x}px)`;
    };

    const ro = new ResizeObserver(() => {
      const w = container.clientWidth;
      if (w > 0) {
        chart.applyOptions({ width: w });
        requestAnimationFrame(repositionLine);
      }
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [colors.line, colors.top, colors.bottom]);

  // Data + replay effect
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const lineEl = lineRef.current;
    if (!chart || !series || data.length === 0) return;

    const lwData = data.map((d) => ({
      time: toLwTime(d.time),
      value: d.value,
    }));

    const showLine = () => {
      if (!lineEl) return;
      const x = chart.timeScale().timeToCoordinate(toLwTime(eventTime));
      if (x === null || Number.isNaN(x)) {
        lineEl.style.display = "none";
        return;
      }
      lineEl.style.display = "block";
      lineEl.style.transform = `translateX(${x}px)`;
    };

    if (!replayMode) {
      series.applyOptions({ autoscaleInfoProvider: () => null });
      series.setData(lwData);
      chart.timeScale().fitContent();
      requestAnimationFrame(showLine);
      return;
    }

    // Replay: pin price scale and time range so the line draws into a fixed window
    const min = Math.min(...data.map((d) => d.value));
    const max = Math.max(...data.map((d) => d.value));
    const padding = (max - min) * 0.08 || Math.abs(min) * 0.0001 || 1;

    series.applyOptions({
      autoscaleInfoProvider: () => ({
        priceRange: { minValue: min - padding, maxValue: max + padding },
      }),
    });

    series.setData([lwData[0]]);
    chart.timeScale().setVisibleRange({
      from: lwData[0].time,
      to: lwData[lwData.length - 1].time,
    });

    if (lineEl) {
      lineEl.classList.remove("news-pulse");
      lineEl.style.display = "none";
    }

    const eventTs = toLwTime(eventTime);
    const intervalMs = 16 / replaySpeed;
    let i = 1;
    let pulsed = false;
    let pulseTimer: ReturnType<typeof setTimeout> | null = null;

    const interval = setInterval(() => {
      if (i >= lwData.length) {
        clearInterval(interval);
        return;
      }
      series.update(lwData[i]);

      if (!pulsed && lwData[i].time >= eventTs) {
        pulsed = true;
        if (lineEl) {
          requestAnimationFrame(() => {
            showLine();
            lineEl.classList.add("news-pulse");
            pulseTimer = setTimeout(() => {
              lineEl.classList.remove("news-pulse");
            }, 1000);
          });
        }
      }

      i++;
    }, intervalMs);

    return () => {
      clearInterval(interval);
      if (pulseTimer) clearTimeout(pulseTimer);
      if (lineEl) lineEl.classList.remove("news-pulse");
    };
  }, [replayKey, replayMode, replaySpeed, data, eventTime]);

  return (
    <div className="rounded-lg border border-white/5 bg-[#080C10] p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-semibold text-zinc-100">{symbol}</span>
        <span className={`font-mono text-sm font-semibold ${colors.text}`}>
          {sign}
          {percentChange.toFixed(2)}%
        </span>
      </div>
      <div className="relative h-[160px] w-full">
        <div ref={containerRef} className="absolute inset-0" />
        <div
          ref={lineRef}
          aria-hidden
          className="pointer-events-none absolute top-0 bottom-0 z-10 border-l border-dashed border-white/40"
          style={{ left: 0, width: 0, transform: "translateX(0)" }}
        >
          <span className="absolute top-1 left-1.5 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-zinc-200">
            News
          </span>
        </div>
      </div>
    </div>
  );
}
