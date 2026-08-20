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
      <p className="rounded-lg border border-dashed border-white/10 bg-white/[0.01] px-4 py-8 text-center text-sm text-zinc-500">
        No asset has a measured move at {WINDOW_LABELS[window]} for this event.
      </p>
    );
  }

  const scale = maxAbs ?? 1;

  return (
    <div>
      <ul className="space-y-1">
        {measured.map(({ asset, value }) => {
          const selected = asset.symbol === selectedSymbol;
          const widthPct = (Math.abs(value) / scale) * 50;
          const formatted = formatPercentChange(value);
          const row = (
            <div className="grid w-full grid-cols-[62px_1fr_68px] items-center gap-2 sm:grid-cols-[76px_1fr_76px] sm:gap-3">
              <span
                className={`truncate text-left font-mono text-[12px] font-semibold ${
                  selected ? "text-[#00FF94]" : "text-zinc-300"
                }`}
              >
                {asset.symbol}
              </span>
              <span className="relative block h-5 rounded-sm bg-white/[0.02]">
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-1/2 w-px bg-white/15"
                />
                <span
                  aria-hidden
                  className="absolute inset-y-[3px] rounded-sm"
                  style={{
                    backgroundColor: moveColor(value),
                    opacity: selected ? 0.85 : 0.5,
                    ...(value >= 0
                      ? { left: "50%", width: `${widthPct}%` }
                      : { right: "50%", width: `${widthPct}%` }),
                  }}
                />
              </span>
              <span
                className={`text-right font-mono text-[12px] font-semibold tabular-nums ${moveTextClass(
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
                  className="w-full rounded px-1 py-0.5 transition hover:bg-white/[0.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF94]/40"
                >
                  {row}
                </button>
              ) : (
                <div
                  className="px-1 py-0.5"
                  title={`${asset.name} — ${formatted} ${WINDOW_DESCRIPTIONS[window]}`}
                >
                  {row}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] text-zinc-600">
        <span>
          Scaled to the largest move in this set,{" "}
          <span className="font-mono tabular-nums text-zinc-400">
            ±{scale.toFixed(2)}%
          </span>
        </span>
        {unmeasured.length > 0 && (
          <span className="text-amber-300/60">
            No {WINDOW_LABELS[window]} measurement:{" "}
            {unmeasured.map((a) => a.symbol).join(", ")}
          </span>
        )}
      </div>
    </div>
  );
}
