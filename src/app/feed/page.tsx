import { Suspense } from "react";

import { Header } from "@/components/Header";
import { EventBrowser } from "@/components/events/EventBrowser";

export default function FeedPage() {
  return (
    <div className="flex flex-1 flex-col bg-[#080C10] text-zinc-100">
      <Header />

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
        <Suspense fallback={null}>
          <EventBrowser />
        </Suspense>
      </section>
    </div>
  );
}
