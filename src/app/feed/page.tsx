import { Suspense } from "react";
import type { Metadata } from "next";

import { Header } from "@/components/Header";
import { EventBrowser } from "@/components/events/EventBrowser";
import { PageHeader } from "@/components/ui/PageHeader";
import { DATA_STATE } from "@/components/ui/dataState";
import { isDatabaseConfigured } from "@/lib/prisma";
import { listEvents } from "@/services/events/eventQueries";
import {
  ZERO_CATEGORY_COUNTS,
  feedQueryKey,
  parseFeedQuery,
} from "@/services/events/queryParams";
import type { FeedInitialData } from "@/components/events/EventBrowser";

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
 *
 * ### Where the first page comes from
 *
 * The server. `EventBrowser` used to mount empty and fetch `/api/events` from
 * the browser, so a reader waited through two skeletons in sequence — the
 * page's Suspense fallback, then the component's own — before any event
 * existed, and the HTML a crawler or a shared link received contained no
 * events at all. The first result set is now queried here, from the same
 * URL state the client will parse, and handed to the browser as `initial`.
 * `/api/events` still serves every subsequent page and every filter change.
 */

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function FeedPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <div className="flex flex-1 flex-col text-ink-2">
      <Header active="feed" />

      <main className="mx-auto w-full max-w-7xl px-5 pt-10 pb-24 sm:px-6 sm:pt-12">
        <PageHeader
          eyebrow="Research library"
          title="Macro event library"
          lede="Every ingested release: what it printed, what was expected where a forecast exists, and how markets moved where the exact release instant is sourced."
          aside={<CardLegend />}
        />

        {/* The shell streams immediately; only the grid waits on Postgres. The
            fallback is therefore the *only* skeleton a reader sees, rather than
            the first of two. */}
        <div className="mt-10">
          <Suspense fallback={<BrowserSkeleton />}>
            <FeedResults searchParams={searchParams} />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

/**
 * Page one, rendered on the server for whatever the URL currently asks for.
 */
async function FeedResults({ searchParams }: { searchParams: SearchParams }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value) && value[0] !== undefined)
      params.set(key, value[0]);
  }

  const initial = await loadFirstPage(parseFeedQuery(params));
  // Keyed on the result set: a link that navigates to `/feed` with different
  // parameters re-renders this component, and the key is what guarantees the
  // browser starts from the new server state instead of keeping the old one.
  return <EventBrowser key={initial.key} initial={initial} />;
}

/**
 * The first result set, or an honest reason there isn't one.
 *
 * A query failure comes back as a message rather than as a thrown error: the
 * browser component already renders a database failure as its own state, and
 * throwing here would replace a working page — filters, search box and all —
 * with a generic error boundary.
 */
async function loadFirstPage(
  query: ReturnType<typeof parseFeedQuery>,
): Promise<FeedInitialData> {
  const base: FeedInitialData = {
    key: feedQueryKey(query),
    category: query.category,
    sort: query.sort,
    search: query.search,
    events: [],
    total: 0,
    rankedCount: 0,
    counts: { ...ZERO_CATEGORY_COUNTS },
    error: null,
  };

  if (!isDatabaseConfigured()) {
    return {
      ...base,
      error:
        "DATABASE_URL is not set. See .env.example — the event library is served from Postgres.",
    };
  }

  try {
    // Page one only. `offset` is the client's business once it starts paging,
    // and honouring it here would server-render page four of a shared URL with
    // no way back to the three above it.
    const result = await listEvents({ ...query, offset: 0 });
    return {
      ...base,
      events: result.events,
      total: result.total,
      rankedCount: result.rankedCount,
      counts: result.counts,
    };
  } catch (err) {
    console.error("[/feed] initial query failed:", err);
    return { ...base, error: "Could not read the event library." };
  }
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
    <dl className="surface-lift space-y-1.5 rounded-lg border border-brand/25 bg-brand-tint px-4 py-3">
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
