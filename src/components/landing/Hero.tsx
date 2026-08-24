import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

/**
 * Hero copy.
 *
 * States what the product does — research how markets historically reacted to
 * macro releases — without claiming coverage or accuracy the current dataset
 * cannot support. The panel beside it is real data or an honest account of what
 * is missing; it is never an illustration of numbers that do not exist.
 */
interface Props {
  panel: React.ReactNode;
}

export function Hero({ panel }: Props) {
  return (
    <section className="relative overflow-hidden border-b border-line">
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-18%] top-[-32%] h-[460px] w-[460px] rounded-full bg-brand/[0.16] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-40%] left-[-12%] h-[420px] w-[420px] rounded-full bg-brand-deep/25 blur-3xl"
      />
      <div className="relative mx-auto grid max-w-6xl grid-cols-1 gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-12 lg:gap-10 lg:py-24">
        <div className="lg:col-span-6 lg:pr-4">
          <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-3">
            <span className="h-1.5 w-1.5 rounded-full bg-brand shadow-[0_0_10px_2px_rgba(91,124,250,0.6)]" />
            Macro research, not headlines
          </span>
          <h1 className="mt-5 font-mono text-[2.25rem] font-semibold leading-[1.08] tracking-tight text-ink sm:text-5xl lg:text-[3.5rem]">
            Research how markets reacted to macro releases.
          </h1>
          <p className="mt-5 max-w-xl font-sans text-base leading-relaxed text-ink-2">
            ImpactFeedAI is a structured record of macro events — what was
            expected, what printed, when, from which source, and how a set of
            instruments moved afterwards. Where the release instant cannot be
            sourced, it shows no reaction rather than a plausible one.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/feed"
              className="inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-brand px-5 font-mono text-sm font-semibold text-white shadow-[0_1px_0_0_rgba(255,255,255,0.16)_inset,0_10px_28px_-12px_rgba(91,124,250,0.85)] transition-colors hover:bg-brand-bright hover:text-canvas"
            >
              Browse the event library
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/patterns"
              className="inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-line bg-surface-2 px-5 font-mono text-sm font-semibold text-ink transition hover:border-line-strong hover:bg-line"
            >
              See the pattern library
            </Link>
          </div>
          <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">
            Free during beta · No account required
          </p>
        </div>

        <div className="min-w-0 lg:col-span-6">{panel}</div>
      </div>
    </section>
  );
}
