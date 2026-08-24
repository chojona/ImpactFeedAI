import { CATEGORY_CONFIG } from "@/lib/eventCategories";
import type { EventCategory } from "@/types/events";

/**
 * Shared appearance for the category selector.
 *
 * The feed and the pattern library both offer the same list of categories, but
 * they had independently styled it: the feed used a solid fill in the full
 * category colour with the label knocked out in the page background, while the
 * pattern library used a tinted outline. Same control, same data, two visual
 * languages one click apart — and the solid version put a saturated block of
 * INFLATION red next to measured red percentages, which is exactly the
 * colour-for-decoration problem the redesign is meant to remove.
 *
 * One definition now, and it is the restrained one. The selected category is
 * marked by a tinted surface, a coloured border and coloured text; nothing in
 * the interface is filled with a taxonomic colour.
 *
 * Returned as inline style rather than classes because the colours come from
 * `CATEGORY_CONFIG` at runtime and Tailwind cannot generate a class per hex.
 */
export const CATEGORY_PILL_BASE =
  "flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors";

/** Unselected pills hover into the brand tint, matching every other control. */
export const CATEGORY_PILL_IDLE = "hover:bg-brand-tint hover:text-ink";

/** Neutral colour for the "all categories" option. */
export const ALL_PILL_COLOR = "#E4E4E7";

export const categoryPillColor = (category: EventCategory): string =>
  CATEGORY_CONFIG[category].color;

export function categoryPillStyle(
  color: string,
  active: boolean,
): React.CSSProperties {
  return active
    ? {
        color,
        borderColor: `${color}7A`,
        backgroundColor: `${color}1F`,
        // A ring in the category's own hue. The selected pill was previously
        // distinguished only by a 12%-alpha fill, which on the old near-black
        // canvas was almost invisible; this reads as "chosen" at a glance
        // without filling the pill with saturated colour.
        boxShadow: `0 0 0 1px ${color}33, 0 4px 14px -8px ${color}80`,
      }
    : {
        color: "var(--color-ink-3)",
        borderColor: "var(--color-line)",
        backgroundColor: "transparent",
      };
}

/**
 * The count chip inside a pill.
 *
 * Brand indigo when the number is non-zero *and* the caller says the count means
 * "measurable", grey otherwise — a category with 11 events and 0 measured
 * reactions should not advertise itself in the same colour as one with 9 of 9
 * priced. Indigo rather than green because this is a coverage count, and green
 * in this product means a market went up.
 */
export const categoryPillCountClass = (positive: boolean): string =>
  `num rounded-full px-1.5 py-0.5 text-[10px] ${
    positive ? "bg-brand-tint-strong text-brand-bright" : "bg-surface-3 text-ink-3"
  }`;
