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
 * Segmented-control styling.
 *
 * The selected segment is brand indigo — tinted fill, indigo border, indigo
 * text — which is the same treatment the navigation and every other selected
 * control uses, so "this one is chosen" is one learnable signal rather than
 * seven similar greys. The unselected segments hover into a faint brand tint,
 * which is how the control announces that it is interactive before it is
 * touched.
 */
const baseClass =
  "min-w-[2.6rem] rounded-md border px-2.5 py-1 text-center font-mono text-[11px] font-semibold uppercase tracking-wider transition-colors";

const stateClass = (active: boolean): string =>
  active
    ? "border-brand/45 bg-brand-tint-strong text-brand-bright"
    : "border-transparent text-ink-3 hover:bg-brand-tint hover:text-ink";

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
      className={`flex items-center gap-1 rounded-lg border border-line bg-canvas/60 p-1 ${className}`}
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
