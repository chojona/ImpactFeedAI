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
        <div className="flex items-center gap-4 sm:gap-6">
          <Link
            href="/feed"
            className="text-sm text-zinc-400 transition hover:text-zinc-100"
          >
            Event feed
          </Link>
          <Link
            href="/patterns"
            className="text-sm text-zinc-400 transition hover:text-zinc-100"
          >
            Patterns
          </Link>
        </div>
      </div>
    </header>
  );
}
