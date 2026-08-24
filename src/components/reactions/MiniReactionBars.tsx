import {
  WINDOW_LABELS,
  formatPercentChange,
  rankByWindow,
} from "@/services/events/reactionView";
import { moveColor, moveTextClass } from "./reactionTone";
import type { AssetReaction, ReactionWindow } from "@/types/events";

/**
 * The smallest honest reaction visual: the next few movers at one horizon, with
 * bars scaled to the largest move in the whole set.
 *
 * Built for the feed, where the job is to let a researcher decide whether an
 * event is worth opening without loading the event. Only measured assets appear
 * — a card that listed every unmeasured symbol at 0.00% would make sparse
 * coverage look like a quiet market.
 *
 * `offset` exists because the card above these bars already states the top
 * mover as a full-size figure. Repeating it as the first bar printed the same
 * percentage twice within a few pixels, which reads as a rendering fault. The
 * bars therefore start at the *second* strongest move while the scale stays
 * pinned to the first, so a short bar here honestly means "smaller than the
 * headline" rather than "smaller than its neighbours".
 */

interface Props {
  assets: readonly AssetReaction[];
  window?: ReactionWindow;
  limit?: number;
  /** Ranks to skip from the top, for callers that render the leader themselves. */
  offset?: number;
  /** Total measured count, when the caller has already computed it. */
  measuredCount?: number;
}

export function MiniReactionBars({
  assets,
  window = "1d",
  limit = 3,
  offset = 1,
  measuredCount,
}: Props) {
  const { measured, maxAbs } = rankByWindow(assets, window);
  const shown = measured.slice(offset, offset + limit);
  if (shown.length === 0) return null;

  const scale = maxAbs ?? 1;
  const total = measuredCount ?? measured.length;
  const remaining = measured.length - offset - shown.length;

  return (
    <div>
      <ul className="space-y-1">
        {shown.map(({ asset, value }) => (
          <li
            key={asset.symbol}
            className="grid grid-cols-[44px_1fr_56px] items-center gap-2"
          >
            <span className="num text-[11px] font-semibold text-ink-2">
              {asset.symbol}
            </span>
            <span className="relative block h-1.5 rounded-full bg-canvas/70">
              <span
                aria-hidden
                className="absolute inset-y-0 left-1/2 w-px bg-line-strong"
              />
              <span
                aria-hidden
                className="absolute inset-y-0 rounded-full"
                style={{
                  backgroundColor: moveColor(value),
                  opacity: 0.92,
                  ...(value >= 0
                    ? {
                        left: "50%",
                        width: `${(Math.abs(value) / scale) * 50}%`,
                      }
                    : {
                        right: "50%",
                        width: `${(Math.abs(value) / scale) * 50}%`,
                      }),
                }}
              />
            </span>
            <span
              className={`num text-right text-[11px] font-semibold ${moveTextClass(
                value,
              )}`}
            >
              {formatPercentChange(value)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-4">
        {total} measured at {WINDOW_LABELS[window]}
        {remaining > 0 && <span> · {remaining} more</span>}
      </p>
    </div>
  );
}
