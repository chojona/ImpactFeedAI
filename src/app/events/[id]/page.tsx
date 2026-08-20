import { Suspense, cache } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Header } from "@/components/Header";
import { EventHeader } from "@/components/events/EventHeader";
import { ReleaseValueGrid } from "@/components/events/ReleaseValues";
import { HorizonMatrix } from "@/components/patterns/HorizonMatrix";
import { EventReactionExplorer } from "@/components/reactions/EventReactionExplorer";
import { BackButton } from "@/components/ui/BackButton";
import { PageSection } from "@/components/ui/PageSection";
import { isDatabaseConfigured } from "@/lib/prisma";
import { profileObservations } from "@/services/analytics/patternAnalysis";
import {
  getEventById,
  listReactionObservations,
} from "@/services/events/eventQueries";
import { releaseHasAnyValue } from "@/services/events/releaseView";
import { reactionTimingIneligibilityExplanation } from "@/services/events/timing";
import type { EventCategory } from "@/types/events";

/**
 * Event detail — the primary research surface.
 *
 * Reads Postgres directly as a Server Component. `generateStaticParams` is not
 * possible here: the id space is every row in `events` and grows with each
 * ingestion run, so the page renders on demand.
 *
 * The page is ordered by what a researcher has to establish before the next
 * thing means anything: what the release was, whether its timing can be
 * trusted, what it printed against expectations, how markets moved, and how
 * that compares with the category's history. When a step cannot be answered the
 * section says so explicitly rather than collapsing — an absent reaction is a
 * finding about the data, not an empty div.
 *
 * There is deliberately **no `loading.tsx`** for this segment. A segment-level
 * loading file streams the shell before the component runs, and once the
 * response has begun streaming `notFound()` can no longer set the status — a
 * missing event would answer 200. The event read is a single indexed lookup, so
 * it is awaited before the response starts; the second, slower query behind the
 * category comparison streams inside its own Suspense boundary instead.
 */
export const dynamic = "force-dynamic";

/**
 * `cache` dedupes the read between `generateMetadata` and the page render,
 * which Next.js invokes separately for the same request.
 */
const loadEvent = cache(getEventById);

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  if (!isDatabaseConfigured()) return { title: "Event — ImpactFeedAI" };
  const event = await loadEvent(id);
  if (event === null) return { title: "Event not found — ImpactFeedAI" };
  return {
    title: `${event.title} — ImpactFeedAI`,
    description:
      event.summary ??
      "Cross-asset market reaction and release provenance for this macro event.",
  };
}

export default async function EventDetailPage({ params }: PageProps) {
  const { id } = await params;
  if (!isDatabaseConfigured()) notFound();

  const event = await loadEvent(id);
  if (!event) notFound();

  const releases = event.releases.filter(releaseHasAnyValue);
  const hasReaction = event.assets.length > 0;

  return (
    <div className="flex flex-1 flex-col bg-[#080C10] text-zinc-100">
      <Header />
      <main className="mx-auto w-full max-w-6xl px-5 pt-8 pb-24 sm:px-6">
        <BackButton />

        <div className="mt-6">
          <EventHeader event={event} />
        </div>

        {releases.length > 0 && (
          <div className="mt-8 space-y-4">
            {releases.map((release, index) => (
              <ReleaseValueGrid
                key={`${release.metricKey ?? release.metricName}-${
                  release.referencePeriodStart ?? index
                }`}
                release={release}
                category={event.category}
              />
            ))}
          </div>
        )}

        {event.explanation !== null && (
          <p className="mt-8 max-w-3xl text-base leading-relaxed text-zinc-300">
            {event.explanation}
          </p>
        )}

        <div className="mt-14 space-y-14">
          <PageSection
            title="Market reaction"
            description="Percent change from the pre-release baseline bar. Only measured windows are plotted; the schema stores four prices per instrument, not a continuous series."
          >
            {!event.timing.reactionEligible ? (
              <ReactionSuppressed
                reason={
                  event.timing.ineligibilityReason === null
                    ? "The stored release timing does not meet the provenance bar."
                    : reactionTimingIneligibilityExplanation(
                        event.timing.ineligibilityReason,
                      )
                }
              />
            ) : hasReaction ? (
              <EventReactionExplorer assets={event.assets} />
            ) : (
              <EmptyNote title="Reaction unavailable">
                This release has a sourced instant, but no current-version price
                reaction is stored for it yet. Run{" "}
                <code className="text-zinc-300">
                  npm run backfill:prices -- --event-id {event.id}
                </code>{" "}
                to measure it.
              </EmptyNote>
            )}
          </PageSection>

          <PageSection
            title={`How ${event.category} events have reacted`}
            description="Median move across every comparable event in the library whose release instant is sourced. The sample size is part of the finding."
            actions={
              <Link
                href={`/patterns?cat=${event.category}`}
                className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#00FF94] transition hover:underline"
              >
                Full pattern →
              </Link>
            }
          >
            <Suspense fallback={<CategoryContextSkeleton />}>
              <CategoryContext category={event.category} />
            </Suspense>
          </PageSection>
        </div>
      </main>
    </div>
  );
}

/**
 * Streamed separately from the page. This is the second database round trip,
 * and it is the one that can be slow on a cold connection — holding the whole
 * event behind it would trade a fast, correct page for a comparison panel that
 * is usually empty today.
 */
async function CategoryContext({ category }: { category: EventCategory }) {
  // Narrow query: three numbers per instrument per event, gated by the same
  // timing rules as everything else in the product.
  const observations = await listReactionObservations(category);
  const profile = profileObservations(observations, category);
  const peers = profile.assets.slice(0, 6);

  if (peers.length === 0) {
    return (
      <EmptyNote title="Not enough verified data">
        No {category} event in the library yet has both a sourced release
        instant and a stored price reaction, so there is nothing to compare this
        event against. This is a data-provider gap — see the coverage table on
        the{" "}
        <Link href="/patterns" className="text-[#00FF94] hover:underline">
          pattern library
        </Link>
        .
      </EmptyNote>
    );
  }

  return (
    <div>
      <p className="mb-4 text-sm text-zinc-400">
        <span className="font-mono font-semibold tabular-nums text-zinc-100">
          {profile.measuredEvents}
        </span>{" "}
        comparable {profile.measuredEvents === 1 ? "event" : "events"} with a
        measured reaction.
      </p>
      <HorizonMatrix assets={peers} activeWindow="1d" />
    </div>
  );
}

function CategoryContextSkeleton() {
  return (
    <div
      aria-hidden
      className="h-48 animate-pulse rounded-lg border border-white/[0.06] bg-white/[0.02]"
    />
  );
}

function ReactionSuppressed({ reason }: { reason: string }) {
  return (
    <div className="rounded-lg border border-amber-300/15 bg-amber-300/[0.02] px-6 py-8">
      <h3 className="text-base font-semibold text-amber-200/90">
        Reaction unavailable — release timing is not verified
      </h3>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-amber-100/60">
        {reason}
      </p>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-500">
        Price windows are anchored to the exact market-facing instant. Measuring
        them against a guessed time would produce percentages that look exactly
        like correct ones, so this event deliberately shows none.
      </p>
    </div>
  );
}

function EmptyNote({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.015] px-6 py-8">
      <h3 className="text-base font-semibold text-zinc-200">{title}</h3>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
        {children}
      </p>
    </div>
  );
}
