import { Suspense } from "react";
import type { Metadata } from "next";

import { Capabilities } from "@/components/landing/Capabilities";
import { Hero } from "@/components/landing/Hero";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingNav } from "@/components/landing/LandingNav";
import { LibraryStats } from "@/components/landing/LibraryStats";
import { LivePreviewPanel } from "@/components/landing/LivePreviewPanel";
import { PricingTable } from "@/components/landing/PricingTable";

/**
 * Landing page.
 *
 * Was one ~800-line file containing a hand-written preview card and a strip of
 * invented statistics. It is now a composition of sections in
 * `components/landing/`, and the two data-bearing sections read Postgres.
 *
 * Revalidated rather than dynamic: the figures move only when an ingestion run
 * lands, so a ten-minute cache keeps the marketing page static-fast without
 * ever serving a number that is not in the database. Both data sections
 * degrade to a no-database state, which is also how they render during `next
 * build` in CI where no connection string exists.
 */
export const revalidate = 600;

export const metadata: Metadata = {
  title: "ImpactFeedAI — Macro market research",
  description:
    "Research how markets historically reacted to macroeconomic releases. Structured records of what was expected, what printed, when, from which source, and how a cross-asset set of instruments moved afterwards.",
};

export default function LandingPage() {
  return (
    <div className="min-h-screen font-sans text-ink antialiased">
      <LandingNav />
      <main>
        <Hero
          panel={
            <Suspense fallback={<PreviewSkeleton />}>
              <LivePreviewPanel />
            </Suspense>
          }
        />
        <Suspense fallback={null}>
          <LibraryStats />
        </Suspense>
        <Capabilities />
        <PricingTable />
      </main>
      <LandingFooter />
    </div>
  );
}

function PreviewSkeleton() {
  return (
    <div aria-hidden>
      <div className="h-4 w-40 animate-pulse rounded bg-white/[0.04]" />
      <div className="mt-2 h-72 animate-pulse rounded-lg border border-line bg-surface-2" />
    </div>
  );
}
