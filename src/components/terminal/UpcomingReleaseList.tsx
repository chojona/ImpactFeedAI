import Link from "next/link";

import { ConsensusBadge, TimingBadge } from "@/components/events/StatusBadges";
import { CategoryBadge } from "@/components/ui/CategoryBadge";
import { DataStatePanel } from "@/components/ui/DataStatePanel";
import { eventWhenDisplay, timingDisplay } from "@/services/events/timing";
import type { NewsEvent } from "@/types/events";

/**
 * Sourced upcoming releases only.
 *
 * Empty is normal while the library is historical — never pad with an
 * unsourced economic calendar.
 */
export function UpcomingReleaseList({
  events,
}: {
  events: readonly NewsEvent[];
}) {
  if (events.length === 0) {
    return (
      <DataStatePanel
        state="unsupported"
        title="No upcoming sourced releases in the library"
        footnote="Only VERIFIED or SCHEDULED rows with a named timing source appear here. An empty list means none are stored yet — not that the official calendar is blank."
      >
        The brief will list future prints as soon as ingestion stores them with
        defensible release timing. Until then, use the calendar and event
        library for historical research.
      </DataStatePanel>
    );
  }

  return (
    <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface-1">
      {events.map((event) => {
        const when = eventWhenDisplay(event);
        const timing = timingDisplay(event.timing);
        const consensus = event.release?.consensusStatus ?? "MISSING";
        return (
          <li key={event.id}>
            <Link
              href={`/events/${event.id}`}
              className="flex flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <CategoryBadge category={event.category} size="xs" />
                  <span className="num text-[11px] text-ink-3">{when.text}</span>
                </div>
                <p className="truncate text-[14px] font-medium text-ink">
                  {event.title}
                </p>
                {event.summary !== null && (
                  <p className="truncate text-[12px] text-ink-3">
                    {event.summary}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <TimingBadge display={timing} size="xs" />
                <ConsensusBadge status={consensus} size="xs" />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
