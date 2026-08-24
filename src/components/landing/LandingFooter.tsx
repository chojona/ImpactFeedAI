import Link from "next/link";
import { Zap } from "lucide-react";

export function LandingFooter() {
  return (
    <footer>
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Zap
              className="h-3.5 w-3.5 text-brand-bright"
              strokeWidth={2.5}
              fill="currentColor"
            />
            <span className="font-mono text-xs font-semibold tracking-tight text-ink-2">
              ImpactFeedAI
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-3">
              · Macro research
            </span>
          </div>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-xs text-ink-2">
            <Link href="/feed" className="transition hover:text-ink">
              Event library
            </Link>
            <Link href="/patterns" className="transition hover:text-ink">
              Patterns
            </Link>
            <Link href="#pricing" className="transition hover:text-ink">
              Pricing
            </Link>
          </nav>
        </div>
        <div className="mt-8 flex flex-col items-start gap-2 border-t border-line pt-6 font-mono text-[11px] text-ink-3 sm:flex-row sm:items-center sm:justify-between">
          <span>© 2025 ImpactFeedAI · All rights reserved</span>
          <span className="uppercase tracking-[0.2em]">
            Research tool · Not investment advice
          </span>
        </div>
      </div>
    </footer>
  );
}
