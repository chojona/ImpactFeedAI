"use client";

import { useMemo, useState } from "react";

import { ReactionSparkline } from "./ReactionSparkline";
import {
  reactionSeries,
  pctForWindow,
  WINDOW_LABELS,
} from "@/services/events/reactionView";
import { formatNewYorkDateTime } from "@/services/events/timing";
import type { AssetReaction, Direction, ReactionWindow } from "@/types/events";

/**
 * Cross-asset reaction for one event.
 *
 * Replaces the animated replay panel, which drove itself from synthetic
 * intraday series in `src/lib/mock-data/charts.ts`. The database stores four
 * prices per asset (anchor, +1h, +1d, +1w), not candles, so there is no real
 * series to replay. What is shown here is exactly what is measured: the move at
 * each window, and a sparkline of the path between them.
 *
 * The window selector re-ranks the assets, which is the actual research
 * question — "what led the reaction over the first hour" and "what led it over
 * the week" have different answers.
 */

const WINDOWS: readonly ReactionWindow[] = ["1h", "1d", "1w"];

const toneFor = (direction: Direction | null): string => {
  if (direction === "UP") return "text-[#00FF94]";
  if (direction === "DOWN") return "text-red-400";
  if (direction === "FLAT") return "text-zinc-400";
  return "text-zinc-600";
};

const formatPct = (pct: number | null): string =>
  pct === null ? "—" : `${pct > 0 ? "+" : ""}${pct.toFixed(2)}%`;

const directionOf = (pct: number | null): Direction | null => {
  if (pct === null || !Number.isFinite(pct)) return null;
  return pct > 0 ? "UP" : pct < 0 ? "DOWN" : "FLAT";
};

interface Props {
  assets: AssetReaction[];
}

export function ReactionPanel({ assets }: Props) {
  const [sortWindow, setSortWindow] = useState<ReactionWindow>("1d");

  const ordered = useMemo(() => {
    // Assets with no reading for the selected window sort last rather than
    // being hidden — an unmeasured window is information about coverage.
    return [...assets].sort((a, b) => {
      const av = pctForWindow(a, sortWindow);
      const bv = pctForWindow(b, sortWindow);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return Math.abs(bv) - Math.abs(av) || a.symbol.localeCompare(b.symbol);
    });
  }, [assets, sortWindow]);

  const measured = assets.filter(
    (a) => pctForWindow(a, sortWindow) !== null,
  ).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            Rank by
          </span>
          <div className="flex items-center gap-1 rounded-md border border-white/5 p-1">
            {WINDOWS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setSortWindow(w)}
                aria-pressed={sortWindow === w}
                className={`rounded px-2.5 py-1 font-mono text-xs font-semibold uppercase transition ${
                  sortWindow === w
                    ? "bg-white/10 text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-200"
                }`}
              >
                {WINDOW_LABELS[w]}
              </button>
            ))}
          </div>
        </div>
        <p className="font-mono text-[11px] tabular-nums text-zinc-500">
          {measured}/{assets.length} assets measured at {WINDOW_LABELS[sortWindow]}
          <span className="ml-2 block normal-case tracking-normal text-zinc-600 sm:inline">
            baseline source bars shown per asset; daily-close fallbacks carry
            the provider&apos;s session-open bar stamp
          </span>
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {ordered.map((asset) => (
          <AssetReactionCard
            key={asset.symbol}
            asset={asset}
            highlight={sortWindow}
          />
        ))}
      </div>
    </div>
  );
}

function AssetReactionCard({
  asset,
  highlight,
}: {
  asset: AssetReaction;
  highlight: ReactionWindow;
}) {
  const series = reactionSeries(asset);
  const highlighted = pctForWindow(asset, highlight);
  const lastMeasured = series.length > 1 ? series[series.length - 1].value : null;
  const chartDirection =
    directionOf(highlighted) ?? directionOf(lastMeasured) ?? "FLAT";
  const anchorLabel = formatNewYorkDateTime(asset.anchorAt);

  return (
    <div className="rounded-lg border border-white/5 bg-[#080C10] p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div>
            <span className="font-semibold text-zinc-100">{asset.symbol}</span>
            <span className="ml-2 truncate text-xs text-zinc-500">
              {asset.name}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-zinc-600">
            {anchorLabel === null
              ? "Pre-release baseline bar not recorded"
              : `Pre-release baseline bar ${anchorLabel}`}
          </p>
        </div>
        <span
          className={`font-mono text-sm font-semibold ${toneFor(
            directionOf(highlighted),
          )}`}
        >
          {formatPct(highlighted)}
        </span>
      </div>

      {series.length >= 2 ? (
        <ReactionSparkline points={series} direction={chartDirection} />
      ) : (
        <p className="flex h-[96px] items-center justify-center text-xs text-zinc-600">
          Not enough measured windows to plot
        </p>
      )}

      <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-white/5 pt-3">
        {WINDOWS.map((w) => {
          const pct = pctForWindow(asset, w);
          return (
            <div key={w}>
              <dt className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                {WINDOW_LABELS[w]}
              </dt>
              <dd
                className={`font-mono text-sm font-semibold tabular-nums ${toneFor(
                  directionOf(pct),
                )} ${w === highlight ? "" : "opacity-70"}`}
              >
                {formatPct(pct)}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
