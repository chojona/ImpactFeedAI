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
        borderColor: `${color}66`,
        backgroundColor: `${color}14`,
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
 * Green when the number is non-zero *and* the caller says the count means
 * "measurable", grey otherwise — a category with 11 events and 0 measured
 * reactions should not advertise itself in the same colour as one with 9 of 9
 * priced.
 */
export const categoryPillCountClass = (positive: boolean): string =>
  `num rounded-full px-1.5 py-0.5 text-[10px] ${
    positive ? "bg-pos/10 text-pos" : "bg-white/[0.06] text-ink-3"
  }`;
