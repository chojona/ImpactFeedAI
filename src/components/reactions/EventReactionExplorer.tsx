"use client";

import { useMemo, useState } from "react";

import { CrossAssetReactionBars } from "./CrossAssetReactionBars";
import { HorizonSelector } from "./HorizonSelector";
import { ReactionChart } from "./ReactionChart";
import { ReactionIndicator } from "./ReactionIndicator";
import { ReactionSummaryTable } from "./ReactionSummaryTable";
import { InstrumentBadge } from "@/components/ui/CategoryBadge";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import {
  WINDOW_DESCRIPTIONS,
  WINDOW_LABELS,
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
 *
 * The layout changed in the redesign rather than the state. The horizon control
 * is now a labelled toolbar rather than a floating button group, and each panel
 * carries a real title with its own coverage count instead of an 10px uppercase
 * label that read as a caption — so a reader can tell which panel is the
 * detail view of one instrument and which is the comparison across all of them.
 */

const DEFAULT_WINDOW: ReactionWindow = "1d";

interface Props {
  assets: readonly AssetReaction[];
}

export function EventReactionExplorer({ assets }: Props) {
  const [horizon, setHorizon] = useState<ReactionWindow>(DEFAULT_WINDOW);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(() =>
    defaultSymbol(assets),
  );

  const selected = useMemo(
    () => assets.find((a) => a.symbol === selectedSymbol) ?? assets[0] ?? null,
    [assets, selectedSymbol],
  );

  const measuredAtHorizon = assets.filter(
    (a) => pctForWindow(a, horizon) !== null,
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-lg border border-line bg-surface-1 px-3 py-2.5">
        <div className="flex items-center gap-3">
          <span className="eyebrow">Horizon</span>
          <HorizonSelector value={horizon} onChange={setHorizon} />
        </div>
        <p className="text-[11px] text-ink-3">
          <span className="num font-semibold text-ink">
            {measuredAtHorizon}/{assets.length}
          </span>{" "}
          instruments measured {WINDOW_DESCRIPTIONS[horizon]}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <Panel
          as="section"
          aria-label="Reaction path for the selected asset"
          className="xl:col-span-7"
        >
          {selected && (
            <SelectedAssetHeader asset={selected} horizon={horizon} />
          )}
          <div className="mt-5">
            <ReactionChart
              asset={selected}
              context={assets}
              highlightWindow={horizon}
            />
          </div>
        </Panel>

        <Panel
          as="section"
          aria-label="Cross-asset reaction table"
          className="xl:col-span-5"
        >
          <PanelHeader
            title="Every instrument, every horizon"
            aside={
              <span className="text-[11px] text-ink-3">
                Select a row to chart it
              </span>
            }
            className="mb-3"
          />
          <ReactionSummaryTable
            assets={assets}
            sortWindow={horizon}
            selectedSymbol={selected?.symbol ?? null}
            onSelect={setSelectedSymbol}
            onSortWindowChange={setHorizon}
          />
        </Panel>
      </div>

      <Panel as="section" aria-label="Cross-asset reaction ranking">
        <PanelHeader
          title={`Which instruments reacted most · ${WINDOW_LABELS[horizon]}`}
          aside={
            <span className="text-[11px] text-ink-3">
              Ranked by absolute move {WINDOW_DESCRIPTIONS[horizon]}
            </span>
          }
          className="mb-4"
        />
        <CrossAssetReactionBars
          assets={assets}
          window={horizon}
          selectedSymbol={selected?.symbol ?? null}
          onSelect={setSelectedSymbol}
        />
      </Panel>
    </div>
  );
}

/**
 * The focused instrument's own headline, above its chart.
 *
 * The value is the loudest thing in the panel and the baseline provenance is
 * the quietest, which is the inverse of how this block used to read: the
 * percentage and the "baseline bar recorded at…" line were within one type step
 * of each other, so the panel had no focal point.
 */
function SelectedAssetHeader({
  asset,
  horizon,
}: {
  asset: AssetReaction;
  horizon: ReactionWindow;
}) {
  const value = pctForWindow(asset, horizon);
  const anchor = formatNewYorkDateTime(asset.anchorAt);
  const windows = measuredWindows(asset);

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-3">
      <div className="min-w-0">
        <InstrumentBadge symbol={asset.symbol} name={asset.name} emphasis />
        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">
          {anchor === null
            ? "Pre-release baseline bar not recorded"
            : `Baseline ${anchor}`}
          {windows.length > 0 && (
            <>
              {" · measured at "}
              <span className="num">
                {windows.map((w) => WINDOW_LABELS[w]).join(", ")}
              </span>
            </>
          )}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <div className="eyebrow">{WINDOW_LABELS[horizon]}</div>
        <div className="mt-1">
          <ReactionIndicator
            value={value}
            symbol={asset.symbol}
            windowLabel={WINDOW_DESCRIPTIONS[horizon]}
            size="lg"
          />
        </div>
        {value === null && (
          <div className="mt-0.5 text-[10px] text-warn">
            No {WINDOW_LABELS[horizon]} reading
          </div>
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
