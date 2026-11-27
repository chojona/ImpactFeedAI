import Link from "next/link";
import { Zap } from "lucide-react";

import { DesktopNav } from "@/components/header/DesktopNav";
import { MobileNav } from "@/components/header/MobileNav";
import type { HeaderSection } from "@/components/header/navLinks";

export type { HeaderSection };

/**
 * In-app navigation for the personal research terminal.
 *
 * The active route is passed in by each page rather than read from
 * `usePathname()`, which would make the header — a component on every research
 * page — a client component for the sake of one boolean. The shell stays a
 * server component; only the mobile disclosure is a client island.
 *
 * Only shipped surfaces appear here. Regimes and notebooks stay off the nav
 * until they have real data behind them.
 */
export function Header({ active }: { active?: HeaderSection }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/80 backdrop-blur-xl">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-brand/45 to-transparent"
      />
      <div className="relative mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5 sm:px-6">
        <Link
          href="/brief"
          className="flex min-h-10 shrink-0 items-center gap-2.5 rounded"
        >
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
        <DesktopNav active={active} />
        <MobileNav active={active} />
      </div>
    </header>
  );
}
