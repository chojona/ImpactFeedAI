import Link from "next/link";
import { Zap } from "lucide-react";
import { EventCard } from "@/components/events/EventCard";
import { mockEvents } from "@/lib/mockEvents";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-[#080C10] text-zinc-100">
      <header className="sticky top-0 z-10 border-b border-white/5 bg-[#080C10]/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <Zap
              className="h-5 w-5 text-[#00FF94]"
              strokeWidth={2.5}
              fill="currentColor"
            />
            <span className="text-lg font-semibold tracking-tight text-zinc-50">
              ImpactFeedAI
            </span>
          </div>
          <button
            type="button"
            className="rounded-md bg-[#00FF94] px-4 py-2 text-sm font-semibold text-[#080C10] transition hover:bg-[#00FF94]/90 focus:outline-none focus:ring-2 focus:ring-[#00FF94]/40"
          >
            Sign Up
          </button>
        </div>
      </header>

      <section className="mx-auto w-full max-w-4xl px-6 pt-24 pb-20 text-center">
        <span className="inline-block rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-medium uppercase tracking-widest text-zinc-400">
          Curated Macro Event Library
        </span>
        <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight text-zinc-50 sm:text-6xl">
          Understand why <span className="text-[#00FF94]">markets move</span>.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-zinc-400 sm:text-xl">
          Every major news event, broken down into a cross-asset reaction story.
          See how tariffs, Fed decisions, and geopolitical shocks ripple through
          stocks, bonds, currencies, and commodities — in the moments that matter.
        </p>
      </section>

      <section className="mx-auto w-full max-w-7xl px-6 pb-24">
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Recent Events
          </h2>
          <span className="text-xs text-zinc-500">{mockEvents.length} of 142</span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mockEvents.map((event) => (
            <Link
              key={event.id}
              href={`/events/${event.id}`}
              className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF94]/40"
            >
              <EventCard event={event} />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
