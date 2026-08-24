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
 *
 * The selected tab is brand indigo: tinted fill, indigo border, indigo text.
 * Three signals rather than the previous single step of grey, because a nav
 * whose active state is "slightly lighter grey" is a nav with no active state at
 * a glance.
 */
type Section = "feed" | "patterns";

const LINKS: readonly { href: string; label: string; section: Section }[] = [
  { href: "/feed", label: "Event library", section: "feed" },
  { href: "/patterns", label: "Patterns", section: "patterns" },
];

export function Header({ active }: { active?: Section }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/80 backdrop-blur-xl">
      {/* A one-pixel brand line under the whole header. Almost subliminal, and
          the cheapest way to make the chrome feel like part of a product rather
          than a browser default. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-brand/45 to-transparent"
      />
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 rounded">
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
