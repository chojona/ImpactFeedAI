import Link from "next/link";
import { ChevronRight } from "lucide-react";

/**
 * Where you are, and how to get back to the broader research.
 *
 * Replaces a `useRouter().back()` button on the event page. Three reasons, in
 * order of weight: a crumb trail answers "where am I in the library" which a
 * back button cannot; the links are real hrefs, so the category crumb takes the
 * reader to *filtered* results rather than wherever they happened to come from;
 * and it removes a client component from the top of the most important page in
 * the product.
 */
export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ trail }: { trail: readonly Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {trail.map((crumb, index) => {
          const last = index === trail.length - 1;
          return (
            <li key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
              {index > 0 && (
                <ChevronRight
                  aria-hidden
                  className="h-3 w-3 shrink-0 text-ink-4"
                  strokeWidth={2}
                />
              )}
              {crumb.href !== undefined && !last ? (
                <Link
                  href={crumb.href}
                  className="rounded font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3 transition-colors hover:text-ink"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className="max-w-[14rem] truncate text-xs text-ink-4 sm:max-w-lg"
                >
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
