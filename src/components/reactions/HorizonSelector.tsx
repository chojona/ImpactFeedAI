import Link from "next/link";

import {
  REACTION_WINDOWS,
  WINDOW_DESCRIPTIONS,
  WINDOW_LABELS,
} from "@/services/events/reactionView";
import type { ReactionWindow } from "@/types/events";

/**
 * Horizon switch shared by the event detail view and the pattern library.
 *
 * Two rendering modes on purpose. `onChange` gives the event page instant
 * client-side switching over data it already holds; `hrefFor` gives the pattern
 * library shareable, JavaScript-free URLs over data that would be too large to
 * ship to the browser just to let a button toggle it.
 */

interface Props {
  value: ReactionWindow;
  onChange?: (window: ReactionWindow) => void;
  hrefFor?: (window: ReactionWindow) => string;
  label?: string;
  className?: string;
}

/**
 * Segmented-control styling. The selected segment gets a filled surface and
 * full-contrast ink; the rest sit at `ink-3` and lift on hover, so the control
 * reads as a set of choices with one taken rather than as three equal labels —
 * the previous inactive state was `zinc-500`, which is below the contrast floor
 * for a 12px label.
 */
const baseClass =
  "min-w-[2.5rem] rounded-md px-2.5 py-1 text-center font-mono text-[11px] font-semibold uppercase tracking-wider transition-colors";

const stateClass = (active: boolean): string =>
  active
    ? "bg-surface-3 text-ink shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
    : "text-ink-3 hover:bg-white/[0.04] hover:text-ink";

export function HorizonSelector({
  value,
  onChange,
  hrefFor,
  label = "Reaction horizon",
  className = "",
}: Props) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`flex items-center gap-1 rounded-lg border border-line bg-black/20 p-1 ${className}`}
    >
      {REACTION_WINDOWS.map((window) => {
        const active = window === value;
        const title = `Move ${WINDOW_DESCRIPTIONS[window]}`;

        if (hrefFor) {
          return (
            <Link
              key={window}
              href={hrefFor(window)}
              scroll={false}
              aria-current={active ? "true" : undefined}
              title={title}
              className={`${baseClass} ${stateClass(active)}`}
            >
              {WINDOW_LABELS[window]}
            </Link>
          );
        }

        return (
          <button
            key={window}
            type="button"
            onClick={() => onChange?.(window)}
            aria-pressed={active}
            title={title}
            className={`${baseClass} ${stateClass(active)}`}
          >
            {WINDOW_LABELS[window]}
          </button>
        );
      })}
    </div>
  );
}
