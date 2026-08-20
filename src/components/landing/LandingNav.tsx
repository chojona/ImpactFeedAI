import Link from "next/link";
import { Zap } from "lucide-react";

/** Landing-page navigation. Deliberately separate from the in-app `Header`. */
export function LandingNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#080C10]/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2">
          <Zap
            className="h-4 w-4 text-[#00FF94]"
            strokeWidth={2.5}
            fill="currentColor"
          />
          <span className="font-mono text-sm font-semibold tracking-tight text-zinc-100">
            ImpactFeedAI
          </span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/patterns"
            className="hidden rounded-md px-3 py-1.5 font-mono text-xs font-medium text-zinc-300 transition hover:text-zinc-100 sm:inline-block"
          >
            Patterns
          </Link>
          <Link
            href="#pricing"
            className="hidden rounded-md px-3 py-1.5 font-mono text-xs font-medium text-zinc-300 transition hover:text-zinc-100 sm:inline-block"
          >
            Pricing
          </Link>
          <Link
            href="/feed"
            className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 font-mono text-xs font-medium text-zinc-100 transition hover:border-white/20 hover:bg-white/[0.06]"
          >
            Open the library
          </Link>
        </nav>
      </div>
    </header>
  );
}
