import {
  WINDOW_LABELS,
  formatPercentChange,
  rankByWindow,
} from "@/services/events/reactionView";
import { moveColor, moveTextClass } from "./reactionTone";
import type { AssetReaction, ReactionWindow } from "@/types/events";

/**
 * The smallest honest reaction visual: the strongest few movers at one horizon,
 * with a bar scaled to the largest of them.
 *
 * Built for the feed, where the job is to let a researcher decide whether an
 * event is worth opening without loading the event. Only measured assets appear
 * — a card that listed every unmeasured symbol at 0.00% would make sparse
 * coverage look like a quiet market.
 */

interface Props {
  assets: readonly AssetReaction[];
  window?: ReactionWindow;
  limit?: number;
}

export function MiniReactionBars({
  assets,
  window = "1d",
  limit = 3,
}: Props) {
  const { measured, maxAbs } = rankByWindow(assets, window);
  if (measured.length === 0) return null;

  const shown = measured.slice(0, limit);
  const scale = maxAbs ?? 1;

  return (
    <div>
      <ul className="space-y-1">
        {shown.map(({ asset, value }) => (
          <li
            key={asset.symbol}
            className="grid grid-cols-[42px_1fr_58px] items-center gap-2"
          >
            <span className="font-mono text-[11px] font-semibold text-zinc-300">
              {asset.symbol}
            </span>
            <span className="relative block h-1.5 rounded-full bg-white/[0.04]">
              <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-white/15" />
              <span
                aria-hidden
                className="absolute inset-y-0 rounded-full"
                style={{
                  backgroundColor: moveColor(value),
                  opacity: 0.75,
                  ...(value >= 0
                    ? { left: "50%", width: `${(Math.abs(value) / scale) * 50}%` }
                    : { right: "50%", width: `${(Math.abs(value) / scale) * 50}%` }),
                }}
              />
            </span>
            <span
              className={`text-right font-mono text-[11px] font-semibold tabular-nums ${moveTextClass(
                value,
              )}`}
            >
              {formatPercentChange(value)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-600">
        {WINDOW_LABELS[window]} move
        {measured.length > shown.length && (
          <span> · {measured.length - shown.length} more measured</span>
        )}
      </p>
    </div>
  );
}
