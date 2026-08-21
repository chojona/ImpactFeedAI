import Link from "next/link";

import {
  CATEGORY_PILL_BASE,
  categoryPillColor,
  categoryPillCountClass,
  categoryPillStyle,
} from "@/components/ui/categoryPill";
import type { CategoryCoverage } from "@/services/events/eventQueries";

/**
 * Category switch for the pattern library.
 *
 * Links rather than buttons: the pattern views are server-rendered over data
 * far too large to ship to the browser for a toggle, and a URL is shareable,
 * bookmarkable and works without JavaScript. Each chip carries the number of
 * events that actually produced a measured reaction, so a category with nothing
 * to show says so before it is opened.
 *
 * Styling comes from `ui/categoryPill`, shared with the feed's filter bar — the
 * two controls select the same taxonomy and used to look nothing alike.
 */

interface Props {
  coverage: readonly CategoryCoverage[];
  active: string;
}

export function CategoryLinks({ coverage, active }: Props) {
  const shown = coverage.filter((c) => c.events > 0);
  if (shown.length === 0) return null;

  return (
    <nav
      aria-label="Event category"
      className="no-scrollbar -mx-1 flex overflow-x-auto px-1"
    >
      <ul className="flex gap-2">
        {shown.map((row) => {
          const isActive = row.category === active;
          const color = categoryPillColor(row.category);
          return (
            <li key={row.category}>
              <Link
                href={`/patterns?cat=${row.category}`}
                aria-current={isActive ? "page" : undefined}
                style={categoryPillStyle(color, isActive)}
                className={`${CATEGORY_PILL_BASE} ${
                  isActive ? "" : "hover:text-ink"
                }`}
              >
                {row.category}
                <span
                  className={categoryPillCountClass(row.measuredEvents > 0)}
                  title={`${row.measuredEvents} of ${row.events} events have a measured reaction`}
                >
                  {row.measuredEvents}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
