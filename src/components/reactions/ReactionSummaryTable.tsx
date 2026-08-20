import {
  REACTION_WINDOWS,
  WINDOW_DESCRIPTIONS,
  WINDOW_LABELS,
  formatPercentChange,
  pctForWindow,
} from "@/services/events/reactionView";
import { heatCellStyle, moveTextClass } from "./reactionTone";
import type { AssetReaction, ReactionWindow } from "@/types/events";

/**
 * Cross-asset reaction table: one row per instrument, one column per measured
 * window.
 *
 * The scanning surface for "what moved, and over what horizon". Cells are
 * tinted in proportion to the largest move in the table, so relative magnitude
 * is readable before the numbers are. An unmeasured window gets **no tint and
 * an em dash** — the absence of a fill is the signal that separates "we did not
 * measure this" from "the market did not move", which a 0.00% would erase.
 *
 * Selecting a row is what drives the chart beside it, so the table is the
 * navigation as well as the data.
 */

interface Props {
  assets: readonly AssetReaction[];
  /** Window used for ordering, and emphasised in the header. */
  sortWindow: ReactionWindow;
  selectedSymbol?: string | null;
  onSelect?: (symbol: string) => void;
  onSortWindowChange?: (window: ReactionWindow) => void;
  caption?: string;
}

export function ReactionSummaryTable({
  assets,
  sortWindow,
  selectedSymbol = null,
  onSelect,
  onSortWindowChange,
  caption,
}: Props) {
  const maxAbs = maxAbsAcross(assets);
  const ordered = orderAssets(assets, sortWindow);
  const measuredCount = assets.filter(
    (a) => pctForWindow(a, sortWindow) !== null,
  ).length;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[300px] border-collapse text-sm">
        <caption className="sr-only">
          {caption ??
            `Percent change from the pre-release baseline for ${assets.length} assets at each measured window.`}
        </caption>
        <thead>
          <tr className="border-b border-white/10">
            <th
              scope="col"
              className="py-2 pr-3 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500"
            >
              Asset
            </th>
            {REACTION_WINDOWS.map((window) => (
              <th
                key={window}
                scope="col"
                aria-sort={window === sortWindow ? "descending" : "none"}
                className="py-2 pl-3 text-right font-mono text-[10px] font-semibold uppercase tracking-[0.16em]"
              >
                {onSortWindowChange ? (
                  <button
                    type="button"
                    onClick={() => onSortWindowChange(window)}
                    aria-pressed={window === sortWindow}
                    title={`Sort by the move ${WINDOW_DESCRIPTIONS[window]}`}
                    className={`rounded px-1.5 py-0.5 transition hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF94]/40 ${
                      window === sortWindow ? "text-zinc-100" : "text-zinc-500"
                    }`}
                  >
                    {WINDOW_LABELS[window]}
                  </button>
                ) : (
                  <span
                    className={
                      window === sortWindow ? "text-zinc-100" : "text-zinc-500"
                    }
                  >
                    {WINDOW_LABELS[window]}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordered.map((asset) => {
            const selected = asset.symbol === selectedSymbol;
            return (
              <tr
                key={asset.symbol}
                className={`border-b border-white/[0.04] transition-colors last:border-0 ${
                  selected ? "bg-white/[0.05]" : "hover:bg-white/[0.02]"
                }`}
              >
                <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                  {onSelect ? (
                    <button
                      type="button"
                      onClick={() => onSelect(asset.symbol)}
                      aria-pressed={selected}
                      className="group flex w-full items-baseline gap-2 rounded px-1 py-0.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF94]/40"
                    >
                      <AssetLabel asset={asset} selected={selected} />
                    </button>
                  ) : (
                    <span className="flex items-baseline gap-2 px-1">
                      <AssetLabel asset={asset} selected={selected} />
                    </span>
                  )}
                </th>
                {REACTION_WINDOWS.map((window) => {
                  const value = pctForWindow(asset, window);
                  const formatted = formatPercentChange(value);
                  return (
                    <td
                      key={window}
                      style={heatCellStyle(value, maxAbs)}
                      title={
                        formatted === null
                          ? `${asset.symbol} ${WINDOW_LABELS[window]}: not measured`
                          : `${asset.symbol} ${formatted} ${WINDOW_DESCRIPTIONS[window]}`
                      }
                      className={`py-1.5 pl-3 pr-2 text-right font-mono text-[13px] tabular-nums ${moveTextClass(
                        value,
                      )} ${window === sortWindow ? "font-semibold" : ""}`}
                    >
                      {formatted ?? <span aria-label="not measured">—</span>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-600">
        <span>
          <span className="font-mono tabular-nums text-zinc-400">
            {measuredCount}/{assets.length}
          </span>{" "}
          assets measured at {WINDOW_LABELS[sortWindow]}
        </span>
        <span>&ldquo;—&rdquo; means not measured, not zero.</span>
      </p>
    </div>
  );
}

function AssetLabel({
  asset,
  selected,
}: {
  asset: AssetReaction;
  selected: boolean;
}) {
  return (
    <>
      <span
        className={`font-mono text-[13px] font-semibold ${
          selected ? "text-[#00FF94]" : "text-zinc-200"
        }`}
      >
        {asset.symbol}
      </span>
      <span className="truncate text-[11px] text-zinc-600">{asset.name}</span>
    </>
  );
}

/**
 * Assets with a reading at the sort window first, largest absolute move first;
 * the rest keep their display order at the bottom. Unmeasured rows stay visible
 * because missing coverage is information about the event.
 */
function orderAssets(
  assets: readonly AssetReaction[],
  window: ReactionWindow,
): AssetReaction[] {
  return [...assets].sort((a, b) => {
    const av = pctForWindow(a, window);
    const bv = pctForWindow(b, window);
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return Math.abs(bv) - Math.abs(av) || a.symbol.localeCompare(b.symbol);
  });
}

function maxAbsAcross(assets: readonly AssetReaction[]): number | null {
  let max: number | null = null;
  for (const asset of assets) {
    for (const window of REACTION_WINDOWS) {
      const value = pctForWindow(asset, window);
      if (value === null) continue;
      const abs = Math.abs(value);
      if (max === null || abs > max) max = abs;
    }
  }
  return max;
}
