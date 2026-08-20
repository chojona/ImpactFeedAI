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

const baseClass =
  "rounded px-2.5 py-1 font-mono text-xs font-semibold uppercase transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF94]/40";

const stateClass = (active: boolean): string =>
  active
    ? "bg-white/10 text-zinc-100"
    : "text-zinc-500 hover:text-zinc-200";

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
      className={`flex items-center gap-1 rounded-md border border-white/5 p-1 ${className}`}
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
