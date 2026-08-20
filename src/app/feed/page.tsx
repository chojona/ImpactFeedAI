import { Suspense } from "react";
import type { Metadata } from "next";

import { Header } from "@/components/Header";
import { EventBrowser } from "@/components/events/EventBrowser";

export const metadata: Metadata = {
  title: "Event library — ImpactFeedAI",
  description:
    "Search and filter macro releases by category, and see the measured cross-asset reaction where release timing is sourced.",
};

/**
 * The event library.
 *
 * The header states what the library is and what it deliberately withholds,
 * because a reader who scrolls a page of cards reading "Reaction unavailable"
 * without that context will conclude the product is broken rather than that the
 * data is honest.
 */
export default function FeedPage() {
  return (
    <div className="flex flex-1 flex-col bg-[#080C10] text-zinc-100">
      <Header />

      <main className="mx-auto w-full max-w-7xl px-5 pt-12 pb-24 sm:px-6">
        <div className="max-w-3xl">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-zinc-50 sm:text-4xl">
            Macro event library
          </h1>
          <p className="mt-3 text-base leading-relaxed text-zinc-400">
            Every ingested release, with what it printed, what was expected
            where a forecast exists, and how markets moved where the exact
            release instant is sourced. Events whose timing cannot be verified
            are kept and searchable, but show no price reaction — an unanchored
            percentage is indistinguishable from a measured one.
          </p>
        </div>

        <div className="mt-10">
          <Suspense fallback={<BrowserSkeleton />}>
            <EventBrowser />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

function BrowserSkeleton() {
  return (
    <div aria-hidden>
      <div className="h-10 animate-pulse rounded-lg border border-white/[0.06] bg-white/[0.02]" />
      <div className="mt-4 h-9 animate-pulse rounded-full border border-white/[0.06] bg-white/[0.02]" />
      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="h-56 animate-pulse rounded-lg border border-white/[0.06] bg-white/[0.02]"
          />
        ))}
      </div>
    </div>
  );
}
