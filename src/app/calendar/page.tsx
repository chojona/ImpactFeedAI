import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";

import { Header } from "@/components/Header";
import { CalendarAgenda } from "@/components/terminal/CalendarAgenda";
import { DataStatePanel } from "@/components/ui/DataStatePanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSection } from "@/components/ui/PageSection";
import { isDatabaseConfigured } from "@/lib/prisma";
import { listCalendarEvents } from "@/services/events/eventQueries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Economic calendar — ImpactFeedAI",
  description:
    "Agenda of ingested macro releases with timing and consensus provenance. No invented schedule rows.",
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Personal calendar over the stored library.
 *
 * Default window: two years back through 30 days forward. The library is still
 * mostly historical, so a short lookback would render an empty agenda even when
 * priced events exist. Future rows appear only when ingestion stored them.
 */
export default async function CalendarPage() {
  const now = new Date();
  const from = new Date(now.getTime() - 730 * DAY_MS);
  const to = new Date(now.getTime() + 30 * DAY_MS);

  return (
    <div className="flex flex-1 flex-col text-ink-2">
      <Header active="calendar" />
      <main className="mx-auto w-full max-w-6xl px-5 pt-10 pb-24 sm:px-6 sm:pt-12">
        <PageHeader
          eyebrow="Personal terminal"
          title="Economic calendar"
          lede="Stored releases in the recent past and near future. Timing and consensus chips say how much weight each row deserves — the calendar never invents an official print."
          aside={
            <p className="max-w-xs text-right text-[11px] leading-relaxed text-ink-3">
              Window{" "}
              <span className="num text-ink-2">
                {from.toISOString().slice(0, 10)}
              </span>{" "}
              →{" "}
              <span className="num text-ink-2">
                {to.toISOString().slice(0, 10)}
              </span>{" "}
              (UTC bounds on stored timestamps)
            </p>
          }
        />

        <div className="mt-10">
          {!isDatabaseConfigured() ? (
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
              The calendar reads Postgres directly.
            </DataStatePanel>
          ) : (
            <PageSection
              eyebrow="Agenda"
              icon={<CalendarDays className="h-3 w-3" strokeWidth={2.5} />}
              title="Library releases in range"
            >
              <CalendarBody from={from} to={to} now={now} />
            </PageSection>
          )}
        </div>
      </main>
    </div>
  );
}

async function CalendarBody({
  from,
  to,
  now,
}: {
  from: Date;
  to: Date;
  now: Date;
}) {
  let events;
  try {
    events = await listCalendarEvents({ from, to, take: 200 });
  } catch (err) {
    console.error("[/calendar] query failed:", err);
    return (
      <DataStatePanel state="error" title="Could not read calendar events">
        Postgres rejected the calendar query.
      </DataStatePanel>
    );
  }
  return <CalendarAgenda events={events} now={now} />;
}
