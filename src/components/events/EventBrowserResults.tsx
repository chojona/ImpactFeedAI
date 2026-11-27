import { Fragment } from "react";
import Link from "next/link";

import { buttonClass } from "@/components/ui/Button";
import { DataStatePanel } from "@/components/ui/DataStatePanel";
import type { FeedRow } from "@/services/events/feedSections";

import { EventCard } from "./EventCard";
import { EventBrowserEmptyState } from "./EventBrowserEmptyState";
import { EventBrowserSectionHeading } from "./EventBrowserSectionHeading";
import { EventBrowserSkeleton } from "./EventBrowserSkeleton";

function Spinner() {
  return (
    <span role="status" className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand/25 border-t-brand-bright"
      />
      <span className="eyebrow">Loading more events</span>
    </span>
  );
}

export function EventBrowserResults({
  error,
  initialLoad,
  loading,
  hasLibrary,
  rows,
  hasMore,
  eventsLoaded,
  onLoadMore,
  loadSentinelRef,
}: {
  error: string | null;
  initialLoad: boolean;
  loading: boolean;
  hasLibrary: boolean;
  rows: FeedRow[];
  hasMore: boolean;
  eventsLoaded: number;
  onLoadMore: () => void;
  loadSentinelRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      {error && (
        <DataStatePanel
          state="error"
          title="Could not load the event library"
          className="mb-6"
          footnote="This is a request or database failure rather than an empty library — an empty library renders its own state."
        >
          {error}
        </DataStatePanel>
      )}

      {initialLoad ? (
        <EventBrowserSkeleton />
      ) : !error && rows.length === 0 ? (
        <EventBrowserEmptyState hasLibrary={hasLibrary} />
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ event, section }) => (
            <Fragment key={event.id}>
              {section !== null && (
                <EventBrowserSectionHeading section={section} />
              )}
              <Link
                href={`/events/${event.id}`}
                className="group block rounded-lg"
              >
                <EventCard event={event} />
              </Link>
            </Fragment>
          ))}
        </div>
      )}

      <div ref={loadSentinelRef} className="h-px" aria-hidden />

      <div aria-live="polite" className="flex justify-center py-8">
        {loading && !initialLoad ? (
          <Spinner />
        ) : hasMore ? (
          <button
            type="button"
            onClick={onLoadMore}
            className={buttonClass("secondary", "md")}
          >
            Load more events
          </button>
        ) : eventsLoaded > 0 ? (
          <p className="eyebrow">End of results</p>
        ) : null}
      </div>
    </>
  );
}
