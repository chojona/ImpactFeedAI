import Link from "next/link";
import { Zap } from "lucide-react";

/** Landing-page navigation. Deliberately separate from the in-app `Header`. */
export function LandingNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-7 w-7 items-center justify-center rounded-md border border-brand/35 bg-brand-tint-strong text-brand-bright"
          >
            <Zap className="h-3.5 w-3.5" strokeWidth={2.5} fill="currentColor" />
          </span>
          <span className="font-mono text-sm font-semibold tracking-tight text-ink">
            ImpactFeedAI
          </span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/patterns"
            className="hidden rounded-md px-3 py-1.5 font-mono text-xs font-medium text-ink-3 transition-colors hover:bg-brand-tint hover:text-ink sm:inline-block"
          >
            Patterns
          </Link>
          <Link
            href="#pricing"
            className="hidden rounded-md px-3 py-1.5 font-mono text-xs font-medium text-ink-3 transition-colors hover:bg-brand-tint hover:text-ink sm:inline-block"
          >
            Pricing
          </Link>
          <Link
            href="/feed"
            className="rounded-md border border-line bg-surface-2 px-3 py-1.5 font-mono text-xs font-medium text-ink transition hover:border-line-strong hover:bg-line"
          >
            Open the library
          </Link>
        </nav>
      </div>
    </header>
  );
}
