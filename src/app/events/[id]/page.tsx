import { Suspense, cache } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Header } from "@/components/Header";
import { EventHeader } from "@/components/events/EventHeader";
import {
  EventReactionSummary,
  summarizeReaction,
} from "@/components/events/EventReactionSummary";
import { ReleaseValueGrid } from "@/components/events/ReleaseValues";
import {
  EventMarketChart,
  MarketChartSkeleton,
} from "@/components/market/EventMarketChart";
import { EventInHistory } from "@/components/patterns/EventInHistory";
import { HorizonMatrix } from "@/components/patterns/HorizonMatrix";
import { EventReactionExplorer } from "@/components/reactions/EventReactionExplorer";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { DataStatePanel } from "@/components/ui/DataStatePanel";
import { PageSection } from "@/components/ui/PageSection";
import { PanelHeader } from "@/components/ui/Panel";
import { isDatabaseConfigured } from "@/lib/prisma";
import { profileObservations } from "@/services/analytics/patternAnalysis";
import {
  getEventById,
  listReactionObservations,
} from "@/services/events/eventQueries";
import { releaseHasAnyValue } from "@/services/events/releaseView";
import { reactionTimingIneligibilityExplanation } from "@/services/events/timing";
import type { AssetReaction, EventCategory } from "@/types/events";

/**
 * Event detail — the primary research surface.
 *
 * Reads Postgres directly as a Server Component. `generateStaticParams` is not
 * possible here: the id space is every row in `events` and grows with each
 * ingestion run, so the page renders on demand.
 *
 * ### Reading order
 *
 * The page is ordered by what a researcher has to establish before the next
 * thing means anything, and the redesign changed *which* of those answers gets
 * the top of the page. It used to open with identity, then a bordered paragraph
 * about timing provenance, then release values — with the first measured
 * percentage roughly a screen and a half down, below a candlestick chart. So
 * the question the product exists to answer ("what did the market do") was the
 * last thing the page said.
 *
 * The order is now:
 *
 *   1. identity and timing            — what happened, when, how trustworthy
 *   2. the reaction verdict           — direction, magnitude, breadth, coverage
 *   3. what printed                   — actual against consensus
 *   4. the traded path, then horizons — evidence behind the verdict
 *   5. category history               — was this reaction ordinary or extreme
 *   6. method                         — how everything above was measured
 *
 * Steps 2 and 6 are the new ones, and they are two halves of the same idea:
 * promote the finding, demote the methodology, and keep both on the page.
 *
 * Section eyebrows carry the taxonomy word only, not an index. Numbering them
 * looked precise until an event with no release rows and no commentary rendered
 * "03", "04", "05" with nothing before it — a sequence with holes reads as
 * missing content rather than as absent sections.
 *
 * When a step cannot be answered the section says so explicitly rather than
 * collapsing — an absent reaction is a finding about the data, not an empty
 * div — and each absence is rendered in the state that names its cause
 * (`suppressed` for a provenance refusal, `pending` for an un-run backfill).
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
  const summary = summarizeReaction(event.assets);

  return (
    <div className="flex flex-1 flex-col bg-canvas text-ink-2">
      <Header active="feed" />
      <main className="mx-auto w-full max-w-6xl px-5 pt-6 pb-24 sm:px-6 sm:pt-8">
        <Breadcrumbs
          trail={[
            { label: "Event library", href: "/feed" },
            { label: event.category, href: `/feed?cat=${event.category}` },
            { label: event.title },
          ]}
        />

        {/* Identity and verdict are one visual group, tightly spaced, because
            together they are the answer a reader came for. */}
        <div className="mt-7 space-y-7">
          <EventHeader event={event} />
          {summary !== null && <EventReactionSummary summary={summary} />}
        </div>

        <div className="mt-14 space-y-14 sm:mt-16 sm:space-y-16">
          {releases.length > 0 && (
            <PageSection
              id="release"
              eyebrow="Release"
              title="What printed"
              description="Every value in the metric's canonical unit. A surprise requires a sourced forecast, so most historical rows show none rather than a zero."
            >
              <div className="space-y-4">
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
            </PageSection>
          )}

          {event.explanation !== null && (
            <PageSection
              id="context"
              eyebrow="Context"
              title="Event context"
            >
              <p className="max-w-3xl text-[15px] leading-relaxed text-ink-2">
                {event.explanation}
              </p>
            </PageSection>
          )}

          <PageSection
            id="reaction"
            eyebrow="Evidence"
            title="Market reaction"
            description="The traded path first, then the stored horizons. The candles are observed hourly bars; the horizons are four prices per instrument, not a continuous series."
          >
            {!event.timing.reactionEligible ? (
              <DataStatePanel
                state="suppressed"
                title="Reaction withheld — release timing is not verified"
                footnote="Price windows are anchored to the exact market-facing instant. Measuring them against a guessed time would produce percentages that look exactly like correct ones, so this event deliberately shows none."
              >
                {event.timing.ineligibilityReason === null
                  ? "The stored release timing does not meet the provenance bar."
                  : reactionTimingIneligibilityExplanation(
                      event.timing.ineligibilityReason,
                    )}
              </DataStatePanel>
            ) : hasReaction ? (
              <div className="space-y-12">
                {/* The chart streams separately — it is a second query, and the
                    reaction table is already in hand from the page's own read. */}
                {event.timing.releaseAt !== null && (
                  <Suspense fallback={<MarketChartSkeleton />}>
                    <EventMarketChart
                      releaseAt={new Date(event.timing.releaseAt)}
                      eventLabel={event.eventType}
                    />
                  </Suspense>
                )}
                <EventReactionExplorer assets={event.assets} />
              </div>
            ) : (
              <DataStatePanel
                state="pending"
                title="Reaction not measured yet"
                footnote={
                  <>
                    Run{" "}
                    <code className="num text-ink-3">
                      npm run backfill:prices -- --event-id {event.id}
                    </code>{" "}
                    to measure it.
                  </>
                }
              >
                This release has a sourced instant, so a reaction can be
                measured — but no current-version price window is stored for it
                yet. This is a pipeline gap, not a data-provider limit.
              </DataStatePanel>
            )}
          </PageSection>

          <PageSection
            id="history"
            eyebrow="Comparison"
            title={`How ${event.category} events have reacted`}
            description="Median move across every comparable event in the library whose release instant is sourced. The sample size is part of the finding."
            actions={
              <Link
                href={`/patterns?cat=${event.category}`}
                className="rounded font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3 transition-colors hover:text-accent"
              >
                Full pattern →
              </Link>
            }
          >
            <Suspense fallback={<CategoryContextSkeleton />}>
              <CategoryContext
                category={event.category}
                eventId={event.id}
                assets={event.assets}
              />
            </Suspense>
          </PageSection>

          <MethodSection event={event} hasReaction={hasReaction} />
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
async function CategoryContext({
  category,
  eventId,
  assets,
}: {
  category: EventCategory;
  eventId: string;
  assets: readonly AssetReaction[];
}) {
  // Narrow query: three numbers per instrument per event, gated by the same
  // timing rules as everything else in the product.
  const observations = await listReactionObservations(category);
  const profile = profileObservations(observations, category);
  const peers = profile.assets.slice(0, 6);

  if (peers.length === 0) {
    return (
      <DataStatePanel
        state="unavailable"
        title="No comparable history yet"
        footnote={
          <>
            This is a data-provider gap rather than a rendering one — see the
            coverage table on the{" "}
            <Link
              href="/patterns"
              className="rounded text-ink-3 underline decoration-line-strong underline-offset-2 hover:text-ink"
            >
              pattern library
            </Link>
            .
          </>
        }
      >
        No {category} event in the library yet has both a sourced release
        instant and a stored price reaction, so there is nothing to compare this
        event against.
      </DataStatePanel>
    );
  }

  return (
    <div className="space-y-10">
      <div className="rounded-lg border border-line bg-surface-1 p-4 sm:p-5">
        <PanelHeader
          title="Typical move by instrument"
          aside={
            <p className="text-[11px] text-ink-3">
              <span className="num font-semibold text-ink">
                {profile.measuredEvents}
              </span>{" "}
              comparable {profile.measuredEvents === 1 ? "event" : "events"}{" "}
              with a measured reaction
            </p>
          }
          className="mb-4"
        />
        <HorizonMatrix assets={peers} activeWindow="1d" />
      </div>

      <EventInHistory
        eventId={eventId}
        category={category}
        assets={assets}
        observations={observations}
      />
    </div>
  );
}

function CategoryContextSkeleton() {
  return (
    <div
      aria-hidden
      className="h-56 animate-pulse rounded-lg border border-line bg-surface-1"
    />
  );
}

/**
 * Level 3, and deliberately last.
 *
 * Everything here was previously scattered through the page as inline caveats
 * competing with the numbers they qualified — what an em dash means, why the
 * axis is not to scale, which calculation version produced the figures. Grouped
 * at the bottom it is still one scroll away from any figure that needs it, and
 * it stops interrupting the scan on the way down.
 */
function MethodSection({
  event,
  hasReaction,
}: {
  event: { timing: { source: string | null }; assets: readonly AssetReaction[] };
  hasReaction: boolean;
}) {
  const version = event.assets[0]?.calculationVersion ?? null;

  return (
    <PageSection
      id="method"
      eyebrow="Method"
      title="How these figures were measured"
    >
      <dl className="grid grid-cols-1 gap-x-10 gap-y-5 text-[13px] leading-relaxed sm:grid-cols-2">
        <div>
          <dt className="eyebrow">Anchor</dt>
          <dd className="mt-1.5 text-ink-3">
            Every percentage is measured from the last bar that closed before
            the release instant, not from the session open.
          </dd>
        </div>
        <div>
          <dt className="eyebrow">Horizons</dt>
          <dd className="mt-1.5 text-ink-3">
            1H is one hour after the release instant; 1D and 1W are one session
            and one week after the release session. They are four stored prices,
            so the reaction chart&rsquo;s slots are evenly spaced and its axis
            is not to scale.
          </dd>
        </div>
        <div>
          <dt className="eyebrow">Absent values</dt>
          <dd className="mt-1.5 text-ink-3">
            An em dash means the window was not measured. It never means zero —
            a fabricated 0.00% is indistinguishable from a flat market and would
            poison every average taken over it.
          </dd>
        </div>
        <div>
          <dt className="eyebrow">Provenance</dt>
          <dd className="mt-1.5 text-ink-3">
            {event.timing.source ?? "No timing source recorded"}
            {hasReaction && version !== null && (
              <>
                {" · calculation version "}
                <span className="num">{version}</span>
              </>
            )}
          </dd>
        </div>
      </dl>
    </PageSection>
  );
}
