import Link from "next/link";

import {
  REACTION_MEASURES,
  MEASURE_DESCRIPTIONS,
  MEASURE_LABELS,
} from "@/services/events/reactionView";
import type { ReactionMeasure } from "@/types/events";

/**
 * Horizon switch shared by the event detail view and the pattern library.
 *
 * Two rendering modes on purpose. `onChange` gives the event page instant
 * client-side switching over data it already holds; `hrefFor` gives the pattern
 * library shareable, JavaScript-free URLs over data that would be too large to
 * ship to the browser just to let a button toggle it.
 */

interface Props {
  value: ReactionMeasure;
  onChange?: (measure: ReactionMeasure) => void;
  hrefFor?: (measure: ReactionMeasure) => string;
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
      {REACTION_MEASURES.map((measure) => {
        const active = measure === value;
        const title = `Move ${MEASURE_DESCRIPTIONS[measure]}`;

        if (hrefFor) {
          return (
            <Link
              key={measure}
              href={hrefFor(measure)}
              scroll={false}
              aria-current={active ? "true" : undefined}
              title={title}
              className={`${baseClass} ${stateClass(active)}`}
            >
              {MEASURE_LABELS[measure]}
            </Link>
          );
        }

        return (
          <button
            key={measure}
            type="button"
            onClick={() => onChange?.(measure)}
            aria-pressed={active}
            title={title}
            className={`${baseClass} ${stateClass(active)}`}
          >
            {MEASURE_LABELS[measure]}
          </button>
        );
      })}
    </div>
  );
}
