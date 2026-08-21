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
        className="pointer-events-none absolute right-[-20%] top-[-30%] h-[420px] w-[420px] rounded-full bg-accent/[0.06] blur-3xl"
      />
      <div className="relative mx-auto grid max-w-6xl grid-cols-1 gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-12 lg:gap-10 lg:py-24">
        <div className="lg:col-span-6 lg:pr-4">
          <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-3">
            <span className="h-1 w-1 rounded-full bg-accent" />
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
              className="inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-accent px-5 font-mono text-sm font-semibold text-canvas transition hover:bg-accent/90"
            >
              Browse the event library
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/patterns"
              className="inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-line bg-white/[0.03] px-5 font-mono text-sm font-semibold text-ink transition hover:border-line-strong hover:bg-white/[0.06]"
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
