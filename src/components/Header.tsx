import Link from "next/link";
import { Zap } from "lucide-react";

/**
 * In-app navigation.
 *
 * The active route is passed in by each page rather than read from
 * `usePathname()`, which would make the header — a component on every research
 * page — a client component for the sake of one boolean. Server-rendered, no
 * hydration, and the current section is marked with `aria-current` as well as a
 * colour change, so "where am I" is answerable by a screen reader too.
 */
type Section = "feed" | "patterns";

const LINKS: readonly { href: string; label: string; section: Section }[] = [
  { href: "/feed", label: "Event library", section: "feed" },
  { href: "/patterns", label: "Patterns", section: "patterns" },
];

export function Header({ active }: { active?: Section }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6">
        <Link href="/" className="flex items-center gap-2 rounded">
          <Zap
            aria-hidden
            className="h-4 w-4 text-accent"
            strokeWidth={2.5}
            fill="currentColor"
          />
          <span className="text-[15px] font-semibold tracking-tight text-ink">
            ImpactFeedAI
          </span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1">
          {LINKS.map((link) => {
            const current = link.section === active;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={current ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 text-[13px] transition-colors ${
                  current
                    ? "bg-white/[0.06] font-medium text-ink"
                    : "text-ink-3 hover:bg-white/[0.03] hover:text-ink"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
