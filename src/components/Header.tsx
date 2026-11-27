import Link from "next/link";
import { Zap } from "lucide-react";

/**
 * In-app navigation for the personal research terminal.
 *
 * The active route is passed in by each page rather than read from
 * `usePathname()`, which would make the header — a component on every research
 * page — a client component for the sake of one boolean. Server-rendered, no
 * hydration, and the current section is marked with `aria-current` as well as a
 * colour change, so "where am I" is answerable by a screen reader too.
 *
 * Only shipped surfaces appear here. Regimes and notebooks stay off the nav
 * until they have real data behind them.
 */
export type HeaderSection =
  | "brief"
  | "calendar"
  | "events"
  | "patterns"
  | "quality";

const LINKS: readonly {
  href: string;
  label: string;
  section: HeaderSection;
}[] = [
  { href: "/brief", label: "Brief", section: "brief" },
  { href: "/calendar", label: "Calendar", section: "calendar" },
  { href: "/feed", label: "Events", section: "events" },
  { href: "/patterns", label: "Patterns", section: "patterns" },
  { href: "/quality", label: "Quality", section: "quality" },
];

export function Header({ active }: { active?: HeaderSection }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/80 backdrop-blur-xl">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-brand/45 to-transparent"
      />
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5 sm:px-6">
        <Link href="/brief" className="flex shrink-0 items-center gap-2.5 rounded">
          <span
            aria-hidden
            className="flex h-7 w-7 items-center justify-center rounded-md border border-brand/35 bg-brand-tint-strong text-brand-bright"
          >
            <Zap className="h-3.5 w-3.5" strokeWidth={2.5} fill="currentColor" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-ink">
            ImpactFeedAI
          </span>
        </Link>
        <nav
          aria-label="Main"
          className="flex max-w-full items-center gap-1 overflow-x-auto"
        >
          {LINKS.map((link) => {
            const current = link.section === active;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={current ? "page" : undefined}
                className={`shrink-0 rounded-md px-2.5 py-1.5 text-[13px] transition-colors sm:px-3 ${
                  current
                    ? "border border-brand/35 bg-brand-tint-strong font-medium text-brand-bright"
                    : "border border-transparent text-ink-3 hover:bg-brand-tint hover:text-ink"
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
