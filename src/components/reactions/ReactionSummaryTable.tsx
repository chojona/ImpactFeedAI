import { InstrumentBadge } from "@/components/ui/CategoryBadge";
import { SessionBasisBadge } from "./SessionBasisBadge";
import { ScrollableTable } from "@/components/ui/ScrollableTable";
import {
  REACTION_MEASURES,
  MEASURE_DESCRIPTIONS,
  MEASURE_LABELS,
  formatPercentChange,
  pctForMeasure,
} from "@/services/events/reactionView";
import { heatCellStyle, moveTextOnTintClass } from "./reactionTone";
import type { AssetReaction, ReactionMeasure } from "@/types/events";

/**
 * Cross-asset reaction table: one row per instrument, one column per measured
 * measure.
 *
 * The scanning surface for "what moved, and over what horizon". Cells are
 * tinted in proportion to the largest move in the table, so relative magnitude
 * is readable before the numbers are. An unmeasured measure gets **no tint and
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
  sortMeasure: ReactionMeasure;
  selectedSymbol?: string | null;
  onSelect?: (symbol: string) => void;
  onSortMeasureChange?: (measure: ReactionMeasure) => void;
  caption?: string;
}

export function ReactionSummaryTable({
  assets,
  sortMeasure,
  selectedSymbol = null,
  onSelect,
  onSortMeasureChange,
  caption,
}: Props) {
  const maxAbs = maxAbsAcross(assets);
  const ordered = orderAssets(assets, sortMeasure);
  const measuredCount = assets.filter(
    (a) => pctForMeasure(a, sortMeasure) !== null,
  ).length;

  return (
    <div>
      <ScrollableTable label="Cross-asset reaction by horizon">
        <table className="w-full min-w-[320px] border-collapse text-sm">
          <caption className="sr-only">
            {caption ??
              `Percent change from the pre-release baseline for ${assets.length} assets at each measured measure.`}
          </caption>
          <thead>
            <tr className="border-b border-line-strong">
              <th
                scope="col"
                className="sticky left-0 z-10 bg-surface-1 py-2 pr-3 text-left"
              >
                <span className="eyebrow">Instrument</span>
              </th>
              {REACTION_MEASURES.map((measure) => (
                <th
                  key={measure}
                  scope="col"
                  aria-sort={measure === sortMeasure ? "descending" : "none"}
                  className="py-2 pl-3 text-right"
                >
                  {onSortMeasureChange ? (
                    <button
                      type="button"
                      onClick={() => onSortMeasureChange(measure)}
                      aria-pressed={measure === sortMeasure}
                      title={`Sort by the move ${MEASURE_DESCRIPTIONS[measure]}`}
                      className={`eyebrow rounded px-1.5 py-0.5 transition-colors hover:text-ink ${
                        measure === sortMeasure ? "text-ink" : ""
                      }`}
                    >
                      {MEASURE_LABELS[measure]}
                    </button>
                  ) : (
                    <span
                      className={`eyebrow ${
                        measure === sortMeasure ? "text-ink" : ""
                      }`}
                    >
                      {MEASURE_LABELS[measure]}
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
                        className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left"
                      >
                        <InstrumentBadge
                          symbol={asset.symbol}
                          name={asset.name}
                          emphasis={selected}
                        />
                        <SessionBasisBadge sessionBasis={asset.sessionBasis} />
                      </button>
                    ) : (
                      <span className="flex items-center gap-1.5 px-1">
                        <InstrumentBadge
                          symbol={asset.symbol}
                          name={asset.name}
                          emphasis={selected}
                        />
                        <SessionBasisBadge sessionBasis={asset.sessionBasis} />
                      </span>
                    )}
                  </th>
                  {REACTION_MEASURES.map((measure) => {
                    const value = pctForMeasure(asset, measure);
                    const formatted = formatPercentChange(value);
                    return (
                      <td
                        key={measure}
                        style={heatCellStyle(value, maxAbs)}
                        title={
                          formatted === null
                            ? `${asset.symbol} ${MEASURE_LABELS[measure]}: not measured`
                            : `${asset.symbol} ${formatted} ${MEASURE_DESCRIPTIONS[measure]}`
                        }
                        // `moveTextOnTintClass` rather than `moveTextClass`:
                        // these cells are drawn on their own colour, and the
                        // base red measures under 3:1 against the strongest
                        // tint the heatmap produces.
                        className={`num py-2 pl-3 pr-2 text-right text-[13px] ${moveTextOnTintClass(
                          value,
                        )} ${measure === sortMeasure ? "font-semibold" : ""}`}
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
          measured at {MEASURE_LABELS[sortMeasure]}
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
 * Assets with a reading at the sort measure first, largest absolute move first;
 * the rest keep their display order at the bottom. Unmeasured rows stay visible
 * because missing coverage is information about the event.
 */
function orderAssets(
  assets: readonly AssetReaction[],
  measure: ReactionMeasure,
): AssetReaction[] {
  return [...assets].sort((a, b) => {
    const av = pctForMeasure(a, measure);
    const bv = pctForMeasure(b, measure);
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return Math.abs(bv) - Math.abs(av) || a.symbol.localeCompare(b.symbol);
  });
}

function maxAbsAcross(assets: readonly AssetReaction[]): number | null {
  let max: number | null = null;
  for (const asset of assets) {
    for (const measure of REACTION_MEASURES) {
      const value = pctForMeasure(asset, measure);
      if (value === null) continue;
      const abs = Math.abs(value);
      if (max === null || abs > max) max = abs;
    }
  }
  return max;
}
