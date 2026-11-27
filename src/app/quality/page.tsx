import type { Metadata } from "next";
import { Database, ListTodo } from "lucide-react";

import { Header } from "@/components/Header";
import { CoverageTable } from "@/components/patterns/CoverageTable";
import { LibraryCoverageMetrics } from "@/components/terminal/LibraryCoverageMetrics";
import { PendingReactionList } from "@/components/terminal/PendingReactionList";
import { DataStatePanel } from "@/components/ui/DataStatePanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSection } from "@/components/ui/PageSection";
import { Panel } from "@/components/ui/Panel";
import { isDatabaseConfigured } from "@/lib/prisma";
import {
  getLibraryCoverage,
  listPendingReactionEvents,
} from "@/services/events/eventQueries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Data quality — ImpactFeedAI",
  description:
    "Library coverage, consensus gaps, and timing-eligible events still waiting on price measurement.",
};

/**
 * Operator-facing quality console for personal research use.
 *
 * Read-only: surfaces what the database can already prove. Does not run
 * verifiers or mutate rows.
 */
export default async function QualityPage() {
  return (
    <div className="flex flex-1 flex-col text-ink-2">
      <Header active="quality" />
      <main className="mx-auto w-full max-w-6xl px-5 pt-10 pb-24 sm:px-6 sm:pt-12">
        <PageHeader
          eyebrow="Personal terminal"
          title="Data quality"
          lede="How much of the library can answer a research question today. Gaps are listed explicitly so thin coverage is visible before you trust an average."
        />

        <div className="mt-10 space-y-14 sm:space-y-16">
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
              Quality metrics are Postgres counts. Without a connection string
              there is nothing to audit.
            </DataStatePanel>
          ) : (
            <QualityBody />
          )}
        </div>
      </main>
    </div>
  );
}

async function QualityBody() {
  let coverage;
  let pending;
  try {
    [coverage, pending] = await Promise.all([
      getLibraryCoverage(),
      listPendingReactionEvents(24),
    ]);
  } catch (err) {
    console.error("[/quality] query failed:", err);
    return (
      <DataStatePanel state="error" title="Could not read quality metrics">
        Postgres rejected the coverage or pending-reaction query.
      </DataStatePanel>
    );
  }

  return (
    <>
      <PageSection
        eyebrow="Coverage"
        icon={<Database className="h-3 w-3" strokeWidth={2.5} />}
        title="What the library can answer"
        description="Verified timing gates every published reaction. Consensus gates every surprise."
      >
        <div className="space-y-6">
          <LibraryCoverageMetrics coverage={coverage} className="w-full" />
          <Panel padding="md">
            <CoverageTable coverage={coverage} />
          </Panel>
        </div>
      </PageSection>

      <PageSection
        eyebrow="Pipeline"
        icon={<ListTodo className="h-3 w-3" strokeWidth={2.5} />}
        title="Eligible but unpriced"
        description="Timing clears the provenance bar, but no current-version reaction measurement exists yet."
      >
        <PendingReactionList events={pending} />
      </PageSection>
    </>
  );
}
