import Link from "next/link";
import type { Metadata } from "next";
import { Activity, CalendarClock, Database } from "lucide-react";

import { Header } from "@/components/Header";
import { EventCardGrid } from "@/components/terminal/EventCardGrid";
import { LibraryCoverageMetrics } from "@/components/terminal/LibraryCoverageMetrics";
import { UpcomingReleaseList } from "@/components/terminal/UpcomingReleaseList";
import { DataStatePanel } from "@/components/ui/DataStatePanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSection } from "@/components/ui/PageSection";
import { isDatabaseConfigured } from "@/lib/prisma";
import {
  getLibraryCoverage,
  listRecentMeasuredEvents,
  listUpcomingSourcedReleases,
} from "@/services/events/eventQueries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Daily brief — ImpactFeedAI",
  description:
    "Personal macro briefing: upcoming sourced releases, recent measured reactions, and library coverage.",
};

/**
 * Morning entry point for the personal research terminal.
 *
 * Composes existing cards and coverage queries. Never invents an economic
 * calendar print or a reaction percentage.
 */
export default async function BriefPage() {
  return (
    <div className="flex flex-1 flex-col text-ink-2">
      <Header active="brief" />
      <main className="mx-auto w-full max-w-7xl px-5 pt-10 pb-24 sm:px-6 sm:pt-12">
        <PageHeader
          eyebrow="Personal terminal"
          title="Daily macro brief"
          lede="What is scheduled with sourced timing, what already moved in the library, and how complete the dataset is. Empty sections mean the data is not stored yet."
        />

        {!isDatabaseConfigured() ? (
          <div className="mt-10">
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
              The brief reads Postgres directly. Without a connection string
              there is nothing to show.
            </DataStatePanel>
          </div>
        ) : (
          <BriefBody />
        )}
      </main>
    </div>
  );
}

async function BriefBody() {
  let coverage;
  let upcoming;
  let recent;
  try {
    [coverage, upcoming, recent] = await Promise.all([
      getLibraryCoverage(),
      listUpcomingSourcedReleases({ take: 12 }),
      listRecentMeasuredEvents(9),
    ]);
  } catch (err) {
    console.error("[/brief] query failed:", err);
    return (
      <div className="mt-10">
        <DataStatePanel state="error" title="Could not read the library">
          The brief could not load coverage or events from Postgres.
        </DataStatePanel>
      </div>
    );
  }

  return (
    <div className="mt-10 space-y-14 sm:space-y-16">
      <PageSection
        eyebrow="Coverage"
        icon={<Database className="h-3 w-3" strokeWidth={2.5} />}
        title="Library pulse"
        description="Counts from the current database — not targets or projections."
        actions={
          <Link
            href="/quality"
            className="rounded font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3 transition-colors hover:text-brand-bright"
          >
            Quality →
          </Link>
        }
      >
        <LibraryCoverageMetrics coverage={coverage} className="w-full" />
      </PageSection>

      <PageSection
        eyebrow="Schedule"
        icon={<CalendarClock className="h-3 w-3" strokeWidth={2.5} />}
        title="Upcoming sourced releases"
        description="Only VERIFIED or SCHEDULED rows with a named timing source and a release instant still ahead of now."
        actions={
          <Link
            href="/calendar"
            className="rounded font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3 transition-colors hover:text-brand-bright"
          >
            Calendar →
          </Link>
        }
      >
        <UpcomingReleaseList events={upcoming} />
      </PageSection>

      <PageSection
        eyebrow="Reactions"
        icon={<Activity className="h-3 w-3" strokeWidth={2.5} />}
        title="Recent measured reactions"
        description="Newest release-session measurements at the current calculation version. Sample size is whatever the library holds."
        actions={
          <Link
            href="/feed?sort=newest"
            className="rounded font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3 transition-colors hover:text-brand-bright"
          >
            Event library →
          </Link>
        }
      >
        {recent.length === 0 ? (
          <DataStatePanel
            state="pending"
            title="No measured reactions yet"
            footnote="Run a price backfill on timing-eligible events to populate this strip."
          >
            There are no current-version release-session measurements to show.
          </DataStatePanel>
        ) : (
          <EventCardGrid events={recent} />
        )}
      </PageSection>
    </div>
  );
}
