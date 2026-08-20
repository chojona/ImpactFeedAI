import type { Metadata } from "next";

import { Header } from "@/components/Header";
import { CategoryLinks } from "@/components/patterns/CategoryLinks";
import { CoverageTable } from "@/components/patterns/CoverageTable";
import { HorizonMatrix } from "@/components/patterns/HorizonMatrix";
import { InsufficientData } from "@/components/patterns/InsufficientData";
import { ReactionDistribution } from "@/components/patterns/ReactionDistribution";
import { HorizonSelector } from "@/components/reactions/HorizonSelector";
import { PageSection } from "@/components/ui/PageSection";
import { FILTERABLE_CATEGORIES } from "@/lib/eventCategories";
import { isDatabaseConfigured } from "@/lib/prisma";
import {
  distributionFor,
  profileObservations,
} from "@/services/analytics/patternAnalysis";
import {
  getLibraryCoverage,
  listReactionObservations,
  type CategoryCoverage,
} from "@/services/events/eventQueries";
import { REACTION_WINDOWS, WINDOW_LABELS } from "@/services/events/reactionView";
import type { EventCategory, ReactionWindow } from "@/types/events";

/**
 * The pattern library: what markets have historically done after each kind of
 * event, plus an honest account of how much of the library can answer that.
 *
 * Rendered on demand — the aggregates change with every ingestion run, and a
 * statically baked page would keep serving whatever the library looked like at
 * deploy time.
 *
 * View state (category, instrument, horizon) lives in the URL rather than in
 * client state. The aggregates are computed from every measured observation in
 * a category, which is far more data than is worth shipping to a browser so a
 * button can filter it, and a URL is shareable — which is what a research
 * finding needs to be.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pattern library — ImpactFeedAI",
  description:
    "How markets have historically reacted to each category of macro release, with the sample size behind every figure.",
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const first = (value: string | string[] | undefined): string | null =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null);

const isCategory = (value: string | null): value is EventCategory =>
  value !== null && (FILTERABLE_CATEGORIES as readonly string[]).includes(value);

const isWindow = (value: string | null): value is ReactionWindow =>
  value !== null && (REACTION_WINDOWS as readonly string[]).includes(value);

/**
 * Open on the category with the most measured events so the page lands on
 * something to look at, falling back to the largest category so it still lands
 * somewhere meaningful when nothing is priced.
 */
function defaultCategory(coverage: readonly CategoryCoverage[]): EventCategory {
  const best = [...coverage].sort(
    (a, b) => b.measuredEvents - a.measuredEvents || b.events - a.events,
  )[0];
  return best?.category ?? "INFLATION";
}

export default async function PatternsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  if (!isDatabaseConfigured()) {
    return (
      <PatternsShell>
        <PageSection title="Library coverage">
          <div className="rounded-lg border border-white/[0.07] bg-white/[0.015] px-6 py-10 text-center">
            <p className="text-zinc-300">No database configured</p>
            <p className="mt-2 text-sm text-zinc-500">
              Set <code className="text-zinc-300">DATABASE_URL</code> — see{" "}
              <code className="text-zinc-300">.env.example</code>.
            </p>
          </div>
        </PageSection>
      </PatternsShell>
    );
  }

  const coverage = await getLibraryCoverage();
  const requested = first(params.cat);
  const category = isCategory(requested)
    ? requested
    : defaultCategory(coverage.categories);
  const categoryCoverage =
    coverage.categories.find((c) => c.category === category) ??
    ({
      category,
      events: 0,
      trustedTiming: 0,
      dateOnly: 0,
      referencePeriodOnly: 0,
      untrustedTiming: 0,
      consensusVerified: 0,
      consensusUnverified: 0,
      consensusMissing: 0,
      measuredEvents: 0,
    } satisfies CategoryCoverage);

  // Only the selected category is loaded. The overview above it is served by
  // grouped aggregate queries, so opening this page never hydrates the library.
  const observations = await listReactionObservations(category);
  const profile = profileObservations(observations, category);

  const requestedWindow = first(params.h);
  const horizon: ReactionWindow = isWindow(requestedWindow)
    ? requestedWindow
    : "1d";

  const requestedSymbol = first(params.sym);
  const symbol =
    profile.assets.find((a) => a.symbol === requestedSymbol)?.symbol ??
    profile.assets[0]?.symbol ??
    null;

  const distribution =
    symbol === null
      ? []
      : distributionFor(observations, category, symbol, horizon);

  const href = (
    next: Partial<{ cat: string; sym: string; h: string }>,
  ): string => {
    const query = new URLSearchParams({ cat: next.cat ?? category });
    const nextSymbol = next.sym ?? symbol;
    if (nextSymbol !== null) query.set("sym", nextSymbol);
    query.set("h", next.h ?? horizon);
    return `/patterns?${query.toString()}`;
  };

  return (
    <PatternsShell>
      <PageSection
        title="Library coverage"
        description="What the database actually holds. Only the verified or officially scheduled slice can produce a price reaction, so this table is also the map of what can be researched today."
      >
        <CoverageTable coverage={coverage} />
      </PageSection>

      <PageSection
        title="Historical reaction by category"
        description="Averages are taken only over events with a sourced release instant and a current-version price calculation. Every figure carries its own sample size."
      >
        <CategoryLinks coverage={coverage.categories} active={category} />

        <div className="mt-6">
          {profile.assets.length === 0 || symbol === null ? (
            <InsufficientData coverage={categoryCoverage} />
          ) : (
            <div className="space-y-8">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <p className="text-sm text-zinc-400">
                  <span className="font-mono text-lg font-semibold tabular-nums text-zinc-100">
                    {profile.measuredEvents}
                  </span>{" "}
                  verified comparable{" "}
                  {profile.measuredEvents === 1 ? "event" : "events"} in{" "}
                  <span className="text-zinc-300">{category}</span>
                  <span className="text-zinc-600">
                    {" "}
                    · of {categoryCoverage.events.toLocaleString()} ingested
                  </span>
                </p>
                <HorizonSelector
                  value={horizon}
                  hrefFor={(w) => href({ h: w })}
                  label="Reaction horizon for the range and distribution"
                />
              </div>

              <HorizonMatrix
                assets={profile.assets}
                activeWindow={horizon}
                selectedSymbol={symbol}
                hrefForSymbol={(s) => href({ sym: s })}
              />

              <div>
                <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  {symbol} · {WINDOW_LABELS[horizon]} distribution
                </h3>
                <p className="mt-1 mb-4 max-w-2xl text-[13px] text-zinc-500">
                  Every individual observation behind the {symbol} row above.
                  Selecting a dot opens the event it came from.
                </p>
                <ReactionDistribution
                  points={distribution}
                  symbol={symbol}
                  window={horizon}
                />
              </div>
            </div>
          )}
        </div>
      </PageSection>
    </PatternsShell>
  );
}

function PatternsShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-[#080C10] text-zinc-100">
      <Header />
      <main className="mx-auto w-full max-w-6xl px-5 pt-12 pb-24 sm:px-6">
        <h1 className="text-3xl font-semibold leading-tight tracking-tight text-zinc-50 sm:text-4xl">
          Pattern library
        </h1>
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-zinc-400">
          How markets have historically reacted to each event type. An average
          over three events and an average over sixty are not the same claim, so
          every number here is shown with the observations behind it — and a
          category with nothing measurable says so instead of showing an empty
          chart.
        </p>
        <div className="mt-10 space-y-14">{children}</div>
      </main>
    </div>
  );
}
