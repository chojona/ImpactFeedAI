import { Suspense } from "react";
import type { Metadata } from "next";

import { Header } from "@/components/Header";
import { EventBrowser } from "@/components/events/EventBrowser";
import { PageHeader } from "@/components/ui/PageHeader";
import { DATA_STATE } from "@/components/ui/dataState";

export const metadata: Metadata = {
  title: "Event library — ImpactFeedAI",
  description:
    "Search and filter macro releases by category, and see the measured cross-asset reaction where release timing is sourced.",
};

/**
 * The event library.
 *
 * The header states what the library is and what it deliberately withholds,
 * because a reader who scrolls a page of cards reading "Reaction withheld"
 * without that context will conclude the product is broken rather than that the
 * data is honest.
 *
 * That context used to be a four-line paragraph at full body size — the most
 * prominent thing on the page was its own methodology. It is now a two-sentence
 * lede plus a legend that says the same thing in the same visual language the
 * cards use, so the explanation is findable without being the headline.
 */
export default function FeedPage() {
  return (
    <div className="flex flex-1 flex-col bg-canvas text-ink-2">
      <Header active="feed" />

      <main className="mx-auto w-full max-w-7xl px-5 pt-10 pb-24 sm:px-6 sm:pt-12">
        <PageHeader
          eyebrow="Research library"
          title="Macro event library"
          lede="Every ingested release: what it printed, what was expected where a forecast exists, and how markets moved where the exact release instant is sourced."
          aside={<CardLegend />}
        />

        <div className="mt-10">
          <Suspense fallback={<BrowserSkeleton />}>
            <EventBrowser />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

/**
 * The three states a card can be in, named once at the top of the page.
 *
 * This is the same registry the cards themselves render from, so the legend
 * cannot drift from what it describes — and it turns "why do most of these say
 * nothing moved" from a suspicion into a documented design decision.
 */
function CardLegend() {
  const rows = [
    {
      state: "measured" as const,
      text: "Release instant sourced and price windows measured",
    },
    {
      state: "suppressed" as const,
      text: "Timing unverified — reaction withheld rather than guessed",
    },
    {
      state: "pending" as const,
      text: "Timing sourced, price backfill not run yet",
    },
  ];

  return (
    <dl className="space-y-1.5 rounded-lg border border-line bg-surface-1 px-4 py-3">
      <dt className="eyebrow mb-2">What a card can say</dt>
      {rows.map((row) => (
        <dd key={row.state} className="flex items-start gap-2.5 text-[11px]">
          <span
            aria-hidden
            className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${
              DATA_STATE[row.state].dot
            }`}
          />
          <span className="text-ink-3">
            <span className={`font-medium ${DATA_STATE[row.state].text}`}>
              {DATA_STATE[row.state].label}
            </span>{" "}
            · {row.text}
          </span>
        </dd>
      ))}
    </dl>
  );
}

/** Mirrors the browser's own toolbar and card grid so nothing shifts. */
function BrowserSkeleton() {
  return (
    <div aria-hidden>
      <div className="h-11 animate-pulse rounded-lg border border-line bg-white/[0.02]" />
      <div className="mt-3 flex gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="h-8 w-24 animate-pulse rounded-full border border-line bg-white/[0.02]"
          />
        ))}
      </div>
      <div className="mt-6 h-4 w-40 animate-pulse rounded bg-white/[0.04]" />
      <div className="mt-6 grid grid-cols-1 items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="h-52 animate-pulse rounded-lg border border-line bg-surface-1"
          />
        ))}
      </div>
    </div>
  );
}
