import Link from "next/link";

import { EventCard } from "@/components/events/EventCard";
import type { NewsEvent } from "@/types/events";

/** Linked grid of existing event cards — shared by Brief recent reactions. */
export function EventCardGrid({ events }: { events: readonly NewsEvent[] }) {
  return (
    <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {events.map((event) => (
        <Link
          key={event.id}
          href={`/events/${event.id}`}
          className="group rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
        >
          <EventCard event={event} />
        </Link>
      ))}
    </div>
  );
}
