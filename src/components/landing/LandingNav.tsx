import Link from "next/link";
import { Zap } from "lucide-react";

/** Landing-page navigation. Deliberately separate from the in-app `Header`. */
export function LandingNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2">
          <Zap
            className="h-4 w-4 text-accent"
            strokeWidth={2.5}
            fill="currentColor"
          />
          <span className="font-mono text-sm font-semibold tracking-tight text-ink">
            ImpactFeedAI
          </span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/patterns"
            className="hidden rounded-md px-3 py-1.5 font-mono text-xs font-medium text-ink-2 transition hover:text-ink sm:inline-block"
          >
            Patterns
          </Link>
          <Link
            href="#pricing"
            className="hidden rounded-md px-3 py-1.5 font-mono text-xs font-medium text-ink-2 transition hover:text-ink sm:inline-block"
          >
            Pricing
          </Link>
          <Link
            href="/feed"
            className="rounded-md border border-line bg-white/[0.03] px-3 py-1.5 font-mono text-xs font-medium text-ink transition hover:border-line-strong hover:bg-white/[0.06]"
          >
            Open the library
          </Link>
        </nav>
      </div>
    </header>
  );
}
