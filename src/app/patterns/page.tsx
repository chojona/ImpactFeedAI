import type { Metadata } from "next";
import { ChartNoAxesColumn, Database } from "lucide-react";

import { Header } from "@/components/Header";
import { CategoryLinks } from "@/components/patterns/CategoryLinks";
import { CoverageTable } from "@/components/patterns/CoverageTable";
import { HorizonMatrix } from "@/components/patterns/HorizonMatrix";
import { InsufficientData } from "@/components/patterns/InsufficientData";
import { ReactionDistribution } from "@/components/patterns/ReactionDistribution";
import { HorizonSelector } from "@/components/reactions/HorizonSelector";
import { DataStatePanel } from "@/components/ui/DataStatePanel";
import { MetricCell, MetricRow } from "@/components/ui/Metric";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSection } from "@/components/ui/PageSection";
import { Panel, PanelHeader } from "@/components/ui/Panel";
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
  type LibraryCoverage,
} from "@/services/events/eventQueries";
import {
  REACTION_WINDOWS,
  WINDOW_LABELS,
} from "@/services/events/reactionView";
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
 *
 * The redesign promoted the four numbers that decide whether this page is worth
 * reading at all — how much is ingested, how much is priced, how much has
 * defensible timing, how much has a forecast — out of a paragraph of prose and
 * into a metric strip beside the title. They were previously discoverable only
 * by reading a five-column table.
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
  value !== null &&
  (FILTERABLE_CATEGORIES as readonly string[]).includes(value);

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
        <PageSection
          eyebrow="Coverage"
          icon={<Database className="h-3 w-3" strokeWidth={2.5} />}
          title="Library coverage"
        >
          <DataStatePanel
            state="error"
            title="No database configured"
            footnote={
              <>
                Set <code className="num text-ink-2">DATABASE_URL</code> — see{" "}
                <code className="num text-ink-2">.env.example</code>.
              </>
            }
          >
            The pattern library reads its aggregates directly from Postgres, so
            without a connection string there is nothing to compute.
          </DataStatePanel>
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
    <PatternsShell aside={<LibraryTotals coverage={coverage} />}>
      <PageSection
        eyebrow="Coverage"
        icon={<Database className="h-3 w-3" strokeWidth={2.5} />}
        title="What the library can answer"
        description="Only the verified or officially scheduled slice can produce a price reaction, so this table is also the map of what can be researched today."
      >
        <Panel padding="md">
          <CoverageTable coverage={coverage} />
        </Panel>
      </PageSection>

      <PageSection
        eyebrow="Aggregate"
        icon={<ChartNoAxesColumn className="h-3 w-3" strokeWidth={2.5} />}
        title="Historical reaction by category"
        description="Medians are taken only over events with a sourced release instant and a current-version price calculation. Every figure carries its own sample size."
      >
        <CategoryLinks coverage={coverage.categories} active={category} />

        <div className="mt-6">
          {profile.assets.length === 0 || symbol === null ? (
            <InsufficientData coverage={categoryCoverage} />
          ) : (
            <div className="space-y-6">
              <Panel padding="md">
                <PanelHeader
                  title={`Typical move per instrument · ${category}`}
                  aside={
                    <div className="flex items-center gap-3">
                      <span className="eyebrow">Horizon</span>
                      <HorizonSelector
                        value={horizon}
                        hrefFor={(w) => href({ h: w })}
                        label="Reaction horizon for the range and distribution"
                      />
                    </div>
                  }
                  className="mb-1"
                />
                <p className="mb-4 text-[11px] text-ink-3">
                  <span className="num font-semibold text-ink">
                    {profile.measuredEvents}
                  </span>{" "}
                  verified comparable{" "}
                  {profile.measuredEvents === 1 ? "event" : "events"}
                  <span className="text-ink-4">
                    {" "}
                    of {categoryCoverage.events.toLocaleString()} ingested ·
                    select an instrument to see its observations
                  </span>
                </p>
                <HorizonMatrix
                  assets={profile.assets}
                  activeWindow={horizon}
                  selectedSymbol={symbol}
                  hrefForSymbol={(s) => href({ sym: s })}
                />
              </Panel>

              <Panel padding="md">
                <PanelHeader
                  title={`${symbol} · every ${WINDOW_LABELS[horizon]} observation`}
                  aside={
                    <span className="text-[11px] text-ink-3">
                      Select a dot to open its event
                    </span>
                  }
                  className="mb-4"
                />
                <ReactionDistribution
                  points={distribution}
                  symbol={symbol}
                  window={horizon}
                />
              </Panel>
            </div>
          )}
        </div>
      </PageSection>
    </PatternsShell>
  );
}

/**
 * The library in four numbers.
 *
 * `Priced` and `Consensus` are the two that matter and both are usually far
 * below `Events`, which is the whole point: the gap *is* the current state of
 * the research programme, and burying it in a table row made the page look more
 * complete than the data is.
 */
function LibraryTotals({ coverage }: { coverage: LibraryCoverage }) {
  const { totals } = coverage;
  return (
    // Brand-tinted: this strip is the page's identity, and the four numbers on
    // it describe the dataset rather than any single market.
    <Panel tone="brand" padding="md" className="w-full lg:w-auto">
      <MetricRow columns={4} aria-label="Library totals">
        <MetricCell
          label="Events"
          value={totals.events.toLocaleString()}
          size="md"
          state="measured"
          note="ingested"
        />
        <MetricCell
          label="Verified timing"
          value={totals.trustedTiming.toLocaleString()}
          size="md"
          state="measured"
          note="can be anchored"
        />
        <MetricCell
          label="Priced"
          value={totals.measuredEvents.toLocaleString()}
          size="md"
          tone={totals.measuredEvents > 0 ? "brand" : "neutral"}
          state="measured"
          note="reaction measured"
        />
        <MetricCell
          label="Consensus"
          value={
            totals.consensusVerified > 0
              ? totals.consensusVerified.toLocaleString()
              : null
          }
          size="md"
          state="unsupported"
          absenceLabel="None"
          note="verified forecast"
          noteTone={totals.consensusVerified > 0 ? "muted" : "caution"}
        />
      </MetricRow>
    </Panel>
  );
}

function PatternsShell({
  children,
  aside,
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col text-ink-2">
      <Header active="patterns" />
      <main className="mx-auto w-full max-w-6xl px-5 pt-10 pb-24 sm:px-6 sm:pt-12">
        <PageHeader
          eyebrow="Research library"
          title="Pattern library"
          lede="How markets have historically reacted to each event type. An average over three events and an average over sixty are not the same claim, so every number here carries the observations behind it."
        />
        {aside !== undefined && <div className="mt-8">{aside}</div>}
        <div className="mt-12 space-y-14 sm:space-y-16">{children}</div>
      </main>
    </div>
  );
}
