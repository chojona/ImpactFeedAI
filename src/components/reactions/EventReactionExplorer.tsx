"use client";

import { useMemo, useState } from "react";

import { CrossAssetReactionBars } from "./CrossAssetReactionBars";
import { HorizonSelector } from "./HorizonSelector";
import { ReactionChart } from "./ReactionChart";
import { ReactionSummaryTable } from "./ReactionSummaryTable";
import { moveTextClass } from "./reactionTone";
import {
  WINDOW_DESCRIPTIONS,
  WINDOW_LABELS,
  formatPercentChange,
  measuredWindows,
  pctForWindow,
  strongestAtWindow,
} from "@/services/events/reactionView";
import { formatNewYorkDateTime } from "@/services/events/timing";
import type { AssetReaction, ReactionWindow } from "@/types/events";

/**
 * The interactive shell around the reaction visualizations.
 *
 * This is the only client component in the reaction stack. The chart, table and
 * bars are plain presentational components with no state of their own, so they
 * can also be rendered on the server (the feed does exactly that). What lives
 * here is the two pieces of view state the research workflow needs — which
 * asset is in focus, and which horizon is being compared — held in one place so
 * every panel stays in sync.
 *
 * All three panels read the same `AssetReaction[]` the server already sent with
 * the page. Switching asset or horizon issues no request.
 */

const DEFAULT_WINDOW: ReactionWindow = "1d";

interface Props {
  assets: readonly AssetReaction[];
}

export function EventReactionExplorer({ assets }: Props) {
  const [horizon, setHorizon] = useState<ReactionWindow>(DEFAULT_WINDOW);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(
    () => defaultSymbol(assets),
  );

  const selected = useMemo(
    () => assets.find((a) => a.symbol === selectedSymbol) ?? assets[0] ?? null,
    [assets, selectedSymbol],
  );

  const measuredAtHorizon = assets.filter(
    (a) => pctForWindow(a, horizon) !== null,
  ).length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <HorizonSelector value={horizon} onChange={setHorizon} />
        <p className="font-mono text-[11px] tabular-nums text-zinc-500">
          {measuredAtHorizon}/{assets.length} measured{" "}
          <span className="normal-case tracking-normal text-zinc-600">
            {WINDOW_DESCRIPTIONS[horizon]}
          </span>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <section
          aria-label="Reaction path for the selected asset"
          className="rounded-lg border border-white/5 bg-white/[0.015] p-4 sm:p-5 xl:col-span-7"
        >
          {selected && <SelectedAssetHeader asset={selected} horizon={horizon} />}
          <div className="mt-4">
            <ReactionChart
              asset={selected}
              context={assets}
              highlightWindow={horizon}
            />
          </div>
        </section>

        <section
          aria-label="Cross-asset reaction table"
          className="rounded-lg border border-white/5 bg-white/[0.015] p-4 sm:p-5 xl:col-span-5"
        >
          <h3 className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            All assets · all horizons
          </h3>
          <ReactionSummaryTable
            assets={assets}
            sortWindow={horizon}
            selectedSymbol={selected?.symbol ?? null}
            onSelect={setSelectedSymbol}
            onSortWindowChange={setHorizon}
          />
        </section>
      </div>

      <section
        aria-label="Cross-asset reaction ranking"
        className="rounded-lg border border-white/5 bg-white/[0.015] p-4 sm:p-5"
      >
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Which assets reacted most · {WINDOW_LABELS[horizon]}
          </h3>
          <p className="text-[11px] text-zinc-600">
            Ranked by absolute move {WINDOW_DESCRIPTIONS[horizon]}
          </p>
        </div>
        <CrossAssetReactionBars
          assets={assets}
          window={horizon}
          selectedSymbol={selected?.symbol ?? null}
          onSelect={setSelectedSymbol}
        />
      </section>
    </div>
  );
}

function SelectedAssetHeader({
  asset,
  horizon,
}: {
  asset: AssetReaction;
  horizon: ReactionWindow;
}) {
  const value = pctForWindow(asset, horizon);
  const formatted = formatPercentChange(value);
  const anchor = formatNewYorkDateTime(asset.anchorAt);
  const windows = measuredWindows(asset);

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-base font-semibold text-zinc-100">
            {asset.symbol}
          </span>
          <span className="truncate text-xs text-zinc-500">{asset.name}</span>
        </div>
        <p className="mt-1 text-[11px] text-zinc-600">
          {anchor === null
            ? "Pre-release baseline bar not recorded"
            : `Baseline bar ${anchor}`}
          {windows.length > 0 && (
            <>
              {" · measured "}
              {windows.map((w) => WINDOW_LABELS[w]).join(", ")}
            </>
          )}
        </p>
      </div>
      <div className="text-right">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
          {WINDOW_LABELS[horizon]}
        </div>
        <div
          className={`font-mono text-2xl font-semibold tabular-nums ${moveTextClass(
            value,
          )}`}
        >
          {formatted ?? "—"}
        </div>
        {formatted === null && (
          <div className="text-[10px] text-amber-300/60">Not measured</div>
        )}
      </div>
    </div>
  );
}

/**
 * Open on the asset that moved most over one session, which is the reading the
 * rest of the app headlines. Falls back to any asset with a measurement before
 * falling back to the first row, so the chart is never empty when data exists.
 */
function defaultSymbol(assets: readonly AssetReaction[]): string | null {
  const strongest = strongestAtWindow(assets, DEFAULT_WINDOW);
  if (strongest) return strongest.asset.symbol;
  const anyMeasured = assets.find((a) => measuredWindows(a).length > 0);
  return anyMeasured?.symbol ?? assets[0]?.symbol ?? null;
}
