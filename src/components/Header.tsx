import Link from "next/link";
import { Zap } from "lucide-react";

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-white/5 bg-[#080C10]/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <Zap
            className="h-5 w-5 text-[#00FF94]"
            strokeWidth={2.5}
            fill="currentColor"
          />
          <span className="text-lg font-semibold tracking-tight text-zinc-50">
            ImpactFeedAI
          </span>
        </Link>
        <div className="flex items-center gap-3 sm:gap-6">
          <Link
            href="/patterns"
            className="hidden text-sm text-zinc-400 transition hover:text-zinc-100 sm:inline-block"
          >
            Patterns
          </Link>
          <Link
            href="/#waitlist"
            className="rounded-md bg-[#00FF94] px-3 py-1.5 text-sm font-semibold text-[#080C10] transition hover:bg-[#00FF94]/90 focus:outline-none focus:ring-2 focus:ring-[#00FF94]/40 sm:px-4 sm:py-2"
          >
            Join Waitlist
          </Link>
        </div>
      </div>
    </header>
  );
}
