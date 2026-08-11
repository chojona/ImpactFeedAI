import { notFound } from "next/navigation";

import { ReactionPanel } from "@/components/charts/ReactionPanel";
import { EventReleaseStats } from "@/components/events/EventReleaseStats";
import { BackButton } from "@/components/ui/BackButton";
import { CATEGORY_CONFIG } from "@/lib/eventCategories";
import { isDatabaseConfigured } from "@/lib/prisma";
import { getEventById } from "@/services/events/eventQueries";
import {
  formatNewYorkDateTime,
  formatPlainDate,
  reactionTimingIneligibilityExplanation,
  timingStatusExplanation,
  timingStatusLabel,
} from "@/services/events/timing";

/**
 * Event detail. Reads Postgres directly as a Server Component.
 *
 * This route used `generateStaticParams` over the twelve placeholder events.
 * That is no longer possible or desirable: the id space is now every row in
 * `events` and grows with each ingestion run, so the page is rendered on demand.
 */
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EventDetailPage({ params }: PageProps) {
  const { id } = await params;
  if (!isDatabaseConfigured()) notFound();

  const event = await getEventById(id);
  if (!event) notFound();

  const categoryColor = CATEGORY_CONFIG[event.category].color;
  const releaseDateTime = formatNewYorkDateTime(event.timing.releaseAt);
  const releaseDate = formatPlainDate(event.timing.releaseDate);
  const timingLabel =
    !event.timing.reactionEligible &&
    (event.timing.status === "VERIFIED" ||
      event.timing.status === "SCHEDULED")
      ? "Timing provenance incomplete"
      : timingStatusLabel(event.timing.status);
  const timingExplanation =
    event.timing.ineligibilityReason === null
      ? timingStatusExplanation(event.timing.status)
      : reactionTimingIneligibilityExplanation(
          event.timing.ineligibilityReason,
        );

  return (
    <div className="flex flex-1 flex-col bg-[#080C10] text-zinc-100">
      <div className="mx-auto w-full max-w-5xl px-6 pt-10 pb-24">
        <BackButton />

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <span
            className="rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]"
            style={{
              backgroundColor: `${categoryColor}20`,
              color: categoryColor,
              border: `1px solid ${categoryColor}40`,
            }}
          >
            {event.category}
          </span>
          {releaseDateTime !== null && event.timing.releaseAt !== null ? (
            <time
              className={`text-sm ${
                event.timing.reactionEligible
                  ? "text-zinc-500"
                  : "text-amber-300/70"
              }`}
              dateTime={event.timing.releaseAt}
            >
              {releaseDateTime}
            </time>
          ) : releaseDate !== null && event.timing.releaseDate !== null ? (
            <time
              className="text-sm text-amber-300/70"
              dateTime={event.timing.releaseDate}
            >
              Release date {releaseDate} · exact time unavailable
            </time>
          ) : (
            <span className="text-sm text-amber-300/70">
              Release timing unavailable
            </span>
          )}
          {event.sourceUrl && (
            <a
              href={event.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-xs font-medium text-[#00FF94] hover:underline"
            >
              Event source ↗
            </a>
          )}
        </div>

        <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-zinc-50 sm:text-4xl">
          {event.title}
        </h1>

        <div
          className={`mt-5 rounded-lg border px-4 py-3 text-sm ${
            event.timing.reactionEligible
              ? "border-[#00FF94]/15 bg-[#00FF94]/[0.03] text-zinc-400"
              : "border-amber-300/15 bg-amber-300/[0.03] text-amber-100/70"
          }`}
        >
          <div className="font-semibold text-zinc-200">{timingLabel}</div>
          <p className="mt-1">{timingExplanation}</p>
          {event.timing.source !== null && (
            <p className="mt-1 text-xs text-zinc-500">
              Timing source: {event.timing.source}
            </p>
          )}
        </div>

        {event.releases.length > 0 && (
          <div className="mt-6 space-y-4">
            {event.releases.map((release, index) => (
              <EventReleaseStats
                key={`${release.metricKey ?? release.metricName}-${release.referencePeriodStart ?? index}`}
                release={release}
                category={event.category}
              />
            ))}
          </div>
        )}

        {event.explanation && (
          <p className="mt-8 text-base leading-relaxed text-zinc-300">
            {event.explanation}
          </p>
        )}

        <SectionHeading>Market Reaction</SectionHeading>

        {!event.timing.reactionEligible ? (
          <EmptyNote>
            Market reactions are suppressed because the release timing is not
            sufficiently trustworthy. A verified or official scheduled instant
            with named provenance is required before price moves can be shown.
          </EmptyNote>
        ) : event.assets.length > 0 ? (
          <ReactionPanel assets={event.assets} />
        ) : (
          <EmptyNote>
            No reactions from the current calculation version are available for
            this verified release yet.
          </EmptyNote>
        )}
      </div>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-12 mb-6 flex items-center gap-4">
      <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
        {children}
      </h2>
      <div className="h-px flex-1 bg-white/5" />
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-white/5 bg-white/[0.02] px-6 py-8 text-sm text-zinc-400">
      {children}
    </p>
  );
}
