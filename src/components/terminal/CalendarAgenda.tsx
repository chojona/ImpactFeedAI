import Link from "next/link";

import { ConsensusBadge, TimingBadge } from "@/components/events/StatusBadges";
import { CategoryBadge } from "@/components/ui/CategoryBadge";
import { DataStatePanel } from "@/components/ui/DataStatePanel";
import {
  eventDateGroup,
  eventWhenDisplay,
  timingDisplay,
} from "@/services/events/timing";
import type { NewsEvent } from "@/types/events";

/**
 * Day-grouped agenda of stored library events.
 *
 * Groups use the same Eastern calendar helper as the feed so a release never
 * lands on two different days depending on which page rendered it.
 */
export function CalendarAgenda({
  events,
  now,
}: {
  events: readonly NewsEvent[];
  now?: Date;
}) {
  if (events.length === 0) {
    return (
      <DataStatePanel
        state="unavailable"
        title="No library events in this window"
        footnote="The calendar only shows ingested rows. It does not invent official schedule entries."
      >
        Widen the date range after more releases are ingested, or open the event
        library to browse everything currently stored.
      </DataStatePanel>
    );
  }

  const clock = now ?? new Date();
  const sections: { key: string; label: string; rows: NewsEvent[] }[] = [];
  const indexByKey = new Map<string, number>();

  for (const event of events) {
    const when = eventWhenDisplay(event);
    const group = eventDateGroup(when.day, clock);
    const existing = indexByKey.get(group.key);
    if (existing === undefined) {
      indexByKey.set(group.key, sections.length);
      sections.push({ key: group.key, label: group.label, rows: [event] });
    } else {
      sections[existing]?.rows.push(event);
    }
  }

  return (
    <div className="space-y-8">
      {sections.map((section) => (
        <section key={section.key}>
          <h3 className="eyebrow mb-3 text-ink-3">{section.label}</h3>
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface-1">
            {section.rows.map((event) => {
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
                        <span className="num text-[11px] text-ink-3">
                          {when.text}
                        </span>
                        {event.timing.reactionEligible &&
                          event.assets.length > 0 && (
                            <span className="text-[11px] text-pos">
                              Measured
                            </span>
                          )}
                      </div>
                      <p className="truncate text-[14px] font-medium text-ink">
                        {event.title}
                      </p>
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
        </section>
      ))}
    </div>
  );
}
