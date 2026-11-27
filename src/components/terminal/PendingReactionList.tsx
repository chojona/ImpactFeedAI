import Link from "next/link";

import { CategoryBadge } from "@/components/ui/CategoryBadge";
import { DataStatePanel } from "@/components/ui/DataStatePanel";
import { eventWhenDisplay } from "@/services/events/timing";
import type { NewsEvent } from "@/types/events";

/** Timing-eligible events still waiting on a current-version price backfill. */
export function PendingReactionList({
  events,
}: {
  events: readonly NewsEvent[];
}) {
  if (events.length === 0) {
    return (
      <DataStatePanel
        state="unavailable"
        title="No pending reaction backfills"
        footnote="Every timing-eligible event currently has at least one current-version measurement row, or none are timing-eligible."
      >
        Eligible releases without prices will appear here after timing is
        sourced and before the price backfill runs.
      </DataStatePanel>
    );
  }

  return (
    <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface-1">
      {events.map((event) => {
        const when = eventWhenDisplay(event);
        return (
          <li key={event.id}>
            <Link
              href={`/events/${event.id}`}
              className="flex flex-col gap-2 px-4 py-3.5 transition-colors hover:bg-surface-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <CategoryBadge category={event.category} size="xs" />
                  <span className="num text-[11px] text-ink-3">{when.text}</span>
                </div>
                <p className="truncate text-[14px] font-medium text-ink">
                  {event.title}
                </p>
              </div>
              <code className="shrink-0 font-mono text-[10px] text-ink-3">
                backfill:prices --event-id {event.id.slice(0, 8)}…
              </code>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
