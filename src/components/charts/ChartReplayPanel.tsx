"use client";

import { useEffect, useMemo, useState } from "react";
import { Play, Square } from "lucide-react";

import { AssetChart } from "./AssetChart";
import type { AssetReaction, ChartDataPoint } from "@/lib/types";

type ReplaySpeed = 1 | 2 | 5 | 10;

const SPEED_OPTIONS: readonly ReplaySpeed[] = [1, 2, 5, 10];

interface Props {
  assets: AssetReaction[];
  charts: Record<string, ChartDataPoint[]>;
  eventTime: string;
}

const formatRelativeTime = (currentIso: string, eventIso: string): string => {
  const diffMs =
    new Date(currentIso).getTime() - new Date(eventIso).getTime();
  const sign = diffMs >= 0 ? "+" : "-";
  const abs = Math.abs(Math.floor(diffMs / 1000));
  const hh = String(Math.floor(abs / 3600)).padStart(2, "0");
  const mm = String(Math.floor((abs % 3600) / 60)).padStart(2, "0");
  const ss = String(abs % 60).padStart(2, "0");
  return `T${sign}${hh}:${mm}:${ss}`;
};

export function ChartReplayPanel({ assets, charts, eventTime }: Props) {
  const [replayKey, setReplayKey] = useState(0);
  const [replaySpeed, setReplaySpeed] = useState<ReplaySpeed>(5);
  const [isReplaying, setIsReplaying] = useState(false);
  const [progress, setProgress] = useState(1);

  const referenceData = useMemo<ChartDataPoint[]>(() => {
    let longest: ChartDataPoint[] = [];
    for (const asset of assets) {
      const series = charts[asset.symbol];
      if (series && series.length > longest.length) longest = series;
    }
    return longest;
  }, [assets, charts]);

  const totalPoints = referenceData.length;

  useEffect(() => {
    if (!isReplaying || totalPoints === 0) return;
    const start = performance.now();
    const intervalMs = 16 / replaySpeed;
    const totalMs = totalPoints * intervalMs;
    let raf = 0;

    const tick = () => {
      const elapsed = performance.now() - start;
      const ratio = Math.min(1, elapsed / totalMs);
      setProgress(ratio);
      if (ratio >= 1) {
        setIsReplaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isReplaying, replayKey, replaySpeed, totalPoints]);

  const handleStart = () => {
    setReplayKey((k) => k + 1);
    setIsReplaying(true);
    setProgress(0);
  };

  const handleStop = () => {
    setIsReplaying(false);
    setProgress(1);
  };

  const currentIdx = isReplaying
    ? Math.min(totalPoints - 1, Math.floor(progress * totalPoints))
    : Math.max(0, totalPoints - 1);
  const currentTimeIso = referenceData[currentIdx]?.time ?? eventTime;
  const passedEvent =
    new Date(currentTimeIso).getTime() >= new Date(eventTime).getTime();

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3 sm:gap-4">
        <div className="flex items-center gap-2.5">
          {!isReplaying && (
            <span
              aria-hidden
              className="h-2 w-2 animate-pulse rounded-full bg-[#00FF94] shadow-[0_0_6px_rgba(0,255,148,0.55)]"
            />
          )}
          <button
            type="button"
            onClick={isReplaying ? handleStop : handleStart}
            className="flex items-center gap-2 rounded-md bg-[#00FF94] px-3 py-1.5 text-sm font-semibold text-[#080C10] transition hover:bg-[#00FF94]/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF94]/40"
          >
            {isReplaying ? (
              <>
                <Square className="h-3 w-3 fill-current" />
                <span>Stop</span>
              </>
            ) : (
              <>
                <Play className="h-3 w-3 fill-current" />
                <span>Replay</span>
              </>
            )}
          </button>
        </div>

        <div className="flex items-center gap-1 rounded-md border border-white/5 p-1">
          {SPEED_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setReplaySpeed(s)}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition ${
                replaySpeed === s
                  ? "bg-white/10 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              {s}x
            </button>
          ))}
        </div>

        <div className="ml-auto flex min-w-[140px] flex-1 items-center gap-3 sm:max-w-md">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-[#00FF94]"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <span className="font-mono text-xs tabular-nums text-zinc-500">
            {Math.round(progress * 100)}%
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span
          aria-hidden
          className={`h-1.5 w-1.5 rounded-full transition-colors ${
            passedEvent ? "bg-[#00FF94]" : "bg-zinc-600"
          }`}
        />
        <span
          className={`font-mono text-xs tracking-wider tabular-nums transition-colors ${
            passedEvent ? "text-[#00FF94]" : "text-zinc-500"
          }`}
        >
          {formatRelativeTime(currentTimeIso, eventTime)}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {assets.map((asset) => {
          const series = charts[asset.symbol];
          if (!series) return null;
          return (
            <AssetChart
              key={asset.symbol}
              symbol={asset.symbol}
              data={series}
              percentChange={asset.percentChange}
              direction={asset.direction}
              eventTime={eventTime}
              replayMode={isReplaying}
              replaySpeed={replaySpeed}
              replayKey={replayKey}
            />
          );
        })}
      </div>
    </div>
  );
}
