import type { FeedSection } from "@/services/events/feedSections";

/**
 * A full-width break in the card grid.
 *
 * One row, a label and a rule — enough to make the boundary unmissable while
 * scrolling, small enough that it never competes with the cards it separates.
 * The unranked marker takes the amber of the rest of the product's coverage
 * vocabulary and a dashed rule, because it is the same statement those states
 * make: this is where the measured data stops.
 */
export function EventBrowserSectionHeading({
  section,
}: {
  section: FeedSection;
}) {
  const unranked = section.kind === "unranked";
  return (
    <div className="col-span-full flex items-center gap-3 pt-4 first:pt-0">
      <span
        className={`shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] ${
          unranked ? "text-warn/85" : "text-ink-3"
        }`}
      >
        {section.label}
      </span>
      <span
        aria-hidden
        className={`h-0 min-w-4 flex-1 border-t ${
          unranked ? "border-dashed border-warn/25" : "border-line"
        }`}
      />
      {section.detail !== null && (
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-4">
          {section.detail}
        </span>
      )}
    </div>
  );
}
