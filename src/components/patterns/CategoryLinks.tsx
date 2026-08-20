import Link from "next/link";

import { CATEGORY_CONFIG } from "@/lib/eventCategories";
import type { CategoryCoverage } from "@/services/events/eventQueries";

/**
 * Category switch for the pattern library.
 *
 * Links rather than buttons: the pattern views are server-rendered over data
 * far too large to ship to the browser for a toggle, and a URL is shareable,
 * bookmarkable and works without JavaScript. Each chip carries the number of
 * events that actually produced a measured reaction, so a category with nothing
 * to show says so before it is opened.
 */

interface Props {
  coverage: readonly CategoryCoverage[];
  active: string;
}

export function CategoryLinks({ coverage, active }: Props) {
  const shown = coverage.filter((c) => c.events > 0);
  if (shown.length === 0) return null;

  return (
    <nav aria-label="Event category" className="no-scrollbar -mx-1 flex overflow-x-auto px-1">
      <ul className="flex gap-2">
        {shown.map((row) => {
          const isActive = row.category === active;
          const color = CATEGORY_CONFIG[row.category].color;
          return (
            <li key={row.category}>
              <Link
                href={`/patterns?cat=${row.category}`}
                aria-current={isActive ? "page" : undefined}
                className="flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                style={{
                  borderColor: isActive ? color : "rgba(255,255,255,0.07)",
                  backgroundColor: isActive ? `${color}1A` : "transparent",
                  color: isActive ? color : "#A1A1AA",
                }}
              >
                {row.category}
                <span
                  className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] tabular-nums ${
                    row.measuredEvents > 0
                      ? "bg-[#00FF94]/10 text-[#00FF94]"
                      : "bg-white/5 text-zinc-500"
                  }`}
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
