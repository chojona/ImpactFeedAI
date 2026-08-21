"use client";

import {
  CATEGORY_PILL_BASE,
  ALL_PILL_COLOR,
  categoryPillColor,
  categoryPillCountClass,
  categoryPillStyle,
} from "@/components/ui/categoryPill";
import { FILTERABLE_CATEGORIES } from "@/lib/eventCategories";
import type { EventCategory } from "@/types/events";

export type CategoryFilter = "ALL" | EventCategory;

/**
 * Derived from `FILTERABLE_CATEGORIES` rather than re-listed, so adding a
 * category (JOBS, when NFP stopped collapsing into OTHER) surfaces in the filter
 * bar without a second edit that is easy to forget.
 */
const FILTER_ORDER: readonly CategoryFilter[] = [
  "ALL",
  ...FILTERABLE_CATEGORIES,
];

const colorFor = (f: CategoryFilter): string =>
  f === "ALL" ? ALL_PILL_COLOR : categoryPillColor(f);

interface Props {
  active: CategoryFilter;
  onChange: (filter: CategoryFilter) => void;
  counts: Record<CategoryFilter, number>;
}

/**
 * Category filter for the feed.
 *
 * Now styled from `ui/categoryPill`, shared with the pattern library's version
 * of the same control — see that module for why the solid-fill selected state
 * was dropped. The Framer Motion sliding pill went with it: a `layoutId`
 * animation existed only to move a block of saturated colour that no longer
 * exists, and a colour transition on the border and surface reads as
 * deliberate rather than as motion for its own sake.
 *
 * `aria-pressed` marks the selection, so the state is not carried by colour
 * alone.
 */
export function CategoryFilterBar({ active, onChange, counts }: Props) {
  return (
    <div
      role="group"
      aria-label="Filter by category"
      className="no-scrollbar -mx-1 flex overflow-x-auto px-1"
    >
      <div className="flex gap-2">
        {FILTER_ORDER.map((f) => {
          const isActive = active === f;
          const count = counts[f] ?? 0;
          const color = colorFor(f);
          return (
            <button
              key={f}
              type="button"
              onClick={() => onChange(f)}
              aria-pressed={isActive}
              style={categoryPillStyle(color, isActive)}
              className={`${CATEGORY_PILL_BASE} ${
                isActive ? "" : "hover:text-ink"
              }`}
            >
              {f}
              <span className={categoryPillCountClass(false)}>{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
