import { DataStateNote } from "@/components/ui/DataStatePanel";
import {
  WINDOW_DESCRIPTIONS,
  WINDOW_LABELS,
  formatPercentChange,
  rankByWindow,
} from "@/services/events/reactionView";
import { moveColor, moveTextClass } from "./reactionTone";
import type { AssetReaction, ReactionWindow } from "@/types/events";

/**
 * Ranked cross-asset comparison for one horizon.
 *
 * Answers the question the reaction table cannot answer at a glance: *which*
 * asset moved most, and by how much relative to the others. Bars diverge from a
 * shared zero axis and are scaled to the largest measured move in the set, so
 * the ordering and the relative magnitudes are both readable.
 *
 * Assets with no reading at the selected horizon are listed below the chart
 * rather than drawn. A zero-length bar and a measured 0.00% are the same
 * picture, and only one of them is a fact about the market.
 *
 * The redesign raised the bar fill opacity (an unselected bar at 0.5 alpha on
 * this background was fainter than the gridline it sat on), gave the zero axis
 * a visible tick and label so the divergence point is findable, and moved the
 * "no measurement at this horizon" list into the shared data-state treatment
 * so it reads the same here as everywhere else in the product.
 */

interface Props {
  assets: readonly AssetReaction[];
  window: ReactionWindow;
  selectedSymbol?: string | null;
  onSelect?: (symbol: string) => void;
}

export function CrossAssetReactionBars({
  assets,
  window,
  selectedSymbol = null,
  onSelect,
}: Props) {
  const { measured, unmeasured, maxAbs } = rankByWindow(assets, window);

  if (measured.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line bg-white/[0.01] px-4 py-8 text-center">
        <p className="text-[13px] text-ink-3">
          No instrument has a measured move at {WINDOW_LABELS[window]} for this
          event.
        </p>
      </div>
    );
  }

  const scale = maxAbs ?? 1;

  return (
    <div>
      <ul className="space-y-0.5">
        {measured.map(({ asset, value }) => {
          const selected = asset.symbol === selectedSymbol;
          const widthPct = (Math.abs(value) / scale) * 50;
          const formatted = formatPercentChange(value);
          const row = (
            <div className="grid w-full grid-cols-[64px_1fr_66px] items-center gap-2 sm:grid-cols-[86px_1fr_74px] sm:gap-3">
              <span
                className={`num truncate text-left text-[12px] font-semibold ${
                  selected ? "text-accent" : "text-ink-2"
                }`}
              >
                {asset.symbol}
              </span>
              <span className="relative block h-5 rounded-[3px] bg-white/[0.025]">
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-1/2 w-px bg-line-strong"
                />
                <span
                  aria-hidden
                  className="absolute inset-y-[3px] rounded-[3px]"
                  style={{
                    backgroundColor: moveColor(value),
                    opacity: selected ? 0.95 : 0.66,
                    ...(value >= 0
                      ? { left: "50%", width: `${widthPct}%` }
                      : { right: "50%", width: `${widthPct}%` }),
                  }}
                />
              </span>
              <span
                className={`num text-right text-[12px] font-semibold ${moveTextClass(
                  value,
                )}`}
              >
                {formatted}
              </span>
            </div>
          );

          return (
            <li key={asset.symbol}>
              {onSelect ? (
                <button
                  type="button"
                  onClick={() => onSelect(asset.symbol)}
                  aria-pressed={selected}
                  title={`${asset.name} — ${formatted} ${WINDOW_DESCRIPTIONS[window]}`}
                  className={`w-full rounded px-1 py-1 transition-colors ${
                    selected ? "bg-white/[0.045]" : "hover:bg-white/[0.03]"
                  }`}
                >
                  {row}
                </button>
              ) : (
                <div
                  className="px-1 py-1"
                  title={`${asset.name} — ${formatted} ${WINDOW_DESCRIPTIONS[window]}`}
                >
                  {row}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Zero axis label, aligned with the tick the bars diverge from. */}
      <div
        aria-hidden
        className="mt-1 grid grid-cols-[64px_1fr_66px] gap-2 sm:grid-cols-[86px_1fr_74px] sm:gap-3"
      >
        <span />
        <span className="relative block">
          <span className="num absolute left-1/2 -translate-x-1/2 text-[10px] text-ink-4">
            0%
          </span>
        </span>
        <span />
      </div>

      <div className="mt-5 space-y-1.5">
        <p className="text-[11px] text-ink-4">
          Bars scaled to the largest move in this set,{" "}
          <span className="num text-ink-3">±{scale.toFixed(2)}%</span>
        </p>
        {unmeasured.length > 0 && (
          <DataStateNote state="unavailable">
            No {WINDOW_LABELS[window]} measurement:{" "}
            <span className="num">
              {unmeasured.map((a) => a.symbol).join(", ")}
            </span>
          </DataStateNote>
        )}
      </div>
    </div>
  );
}
