import { InstrumentBadge } from "@/components/ui/CategoryBadge";
import { ScrollableTable } from "@/components/ui/ScrollableTable";
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
 *
 * Two redesign changes, both about the phone. The instrument column is
 * `sticky left-0`, so scrolling the horizons sideways no longer scrolls the
 * ticker out of view and leaves a grid of unlabelled percentages; and the
 * scroll container carries an edge indicator that appears only when the table
 * actually overflows, instead of guillotining a column mid-glyph — which is
 * what made the mobile layout look broken rather than merely narrow.
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
    <div>
      <ScrollableTable label="Cross-asset reaction by horizon">
        <table className="w-full min-w-[320px] border-collapse text-sm">
          <caption className="sr-only">
            {caption ??
              `Percent change from the pre-release baseline for ${assets.length} assets at each measured window.`}
          </caption>
          <thead>
            <tr className="border-b border-line-strong">
              <th
                scope="col"
                className="sticky left-0 z-10 bg-surface-1 py-2 pr-3 text-left"
              >
                <span className="eyebrow">Instrument</span>
              </th>
              {REACTION_WINDOWS.map((window) => (
                <th
                  key={window}
                  scope="col"
                  aria-sort={window === sortWindow ? "descending" : "none"}
                  className="py-2 pl-3 text-right"
                >
                  {onSortWindowChange ? (
                    <button
                      type="button"
                      onClick={() => onSortWindowChange(window)}
                      aria-pressed={window === sortWindow}
                      title={`Sort by the move ${WINDOW_DESCRIPTIONS[window]}`}
                      className={`eyebrow rounded px-1.5 py-0.5 transition-colors hover:text-ink ${
                        window === sortWindow ? "text-ink" : ""
                      }`}
                    >
                      {WINDOW_LABELS[window]}
                    </button>
                  ) : (
                    <span
                      className={`eyebrow ${
                        window === sortWindow ? "text-ink" : ""
                      }`}
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
                  className={`group border-b border-line transition-colors last:border-0 ${
                    selected ? "bg-surface-2" : "hover:bg-white/[0.02]"
                  }`}
                >
                  <th
                    scope="row"
                    className={`sticky left-0 z-10 py-1.5 pr-3 text-left font-normal ${
                      selected
                        ? "bg-surface-2"
                        : "bg-surface-1 group-hover:bg-surface-2"
                    }`}
                  >
                    {onSelect ? (
                      <button
                        type="button"
                        onClick={() => onSelect(asset.symbol)}
                        aria-pressed={selected}
                        title={`Chart ${asset.symbol}`}
                        className="flex w-full rounded px-1 py-0.5 text-left"
                      >
                        <InstrumentBadge
                          symbol={asset.symbol}
                          name={asset.name}
                          emphasis={selected}
                        />
                      </button>
                    ) : (
                      <span className="flex px-1">
                        <InstrumentBadge
                          symbol={asset.symbol}
                          name={asset.name}
                          emphasis={selected}
                        />
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
                        className={`num py-2 pl-3 pr-2 text-right text-[13px] ${moveTextClass(
                          value,
                        )} ${window === sortWindow ? "font-semibold" : ""}`}
                      >
                        {formatted ?? (
                          <span aria-label="not measured">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollableTable>

      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-3">
        <span>
          <span className="num font-semibold text-ink">
            {measuredCount}/{assets.length}
          </span>{" "}
          measured at {WINDOW_LABELS[sortWindow]}
        </span>
        <span className="text-ink-4">
          <span aria-hidden className="num">
            —
          </span>{" "}
          means not measured, not zero
        </span>
      </p>
    </div>
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
