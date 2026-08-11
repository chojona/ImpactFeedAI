import { Header } from "@/components/Header";
import { PatternCard } from "@/components/patterns/PatternCard";
import { FILTERABLE_CATEGORIES } from "@/lib/eventCategories";
import { isDatabaseConfigured } from "@/lib/prisma";
import { listEventsForCategory } from "@/services/events/eventQueries";
import { analyzeCategory } from "@/services/analytics/patternAnalysis";

/**
 * Aggregate reaction stats per category, computed from the database.
 *
 * Rendered on demand rather than at build time: the aggregates change with every
 * ingestion run, and a statically baked page would keep serving whatever the
 * library looked like at deploy time.
 */
export const dynamic = "force-dynamic";

/** A category needs this many measured events before its averages are shown. */
const MIN_SAMPLE_SIZE = 2;

export default async function PatternsPage() {
  const configured = isDatabaseConfigured();

  const patterns = configured
    ? (
        await Promise.all(
          FILTERABLE_CATEGORIES.map(async (category) => {
            const events = await listEventsForCategory(category);
            return analyzeCategory(events, category);
          }),
        )
      ).filter(
        (p) => p.measuredSampleSize >= MIN_SAMPLE_SIZE && p.avgReactions.length > 0,
      )
    : [];

  return (
    <div className="flex flex-1 flex-col bg-[#080C10] text-zinc-100">
      <Header />
      <section className="mx-auto w-full max-w-5xl px-6 pt-16 pb-24">
        <h1 className="text-4xl font-semibold leading-tight tracking-tight text-zinc-50 sm:text-5xl">
          Pattern Library
        </h1>
        <p className="mt-3 max-w-2xl text-lg leading-relaxed text-zinc-400">
          How markets have historically reacted to each event type. Averages are
          taken over the events in the library that have a measured reaction —
          each asset row shows its own sample size, because an average over three
          events and an average over sixty are not the same claim.
        </p>

        {patterns.length > 0 ? (
          <div className="mt-12 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {patterns.map((p) => (
              <PatternCard key={p.category} pattern={p} />
            ))}
          </div>
        ) : (
          <div className="mt-12 rounded-lg border border-white/5 bg-white/[0.02] px-6 py-16 text-center">
            <p className="text-zinc-300">
              {configured
                ? "Not enough measured events yet"
                : "No database configured"}
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              {configured ? (
                <>
                  A category needs at least {MIN_SAMPLE_SIZE} events with price
                  reactions before an average means anything. Current source
                  observations stay unpriced until an authoritative release
                  calendar establishes exact timing and the trusted events are
                  backfilled.
                </>
              ) : (
                <>
                  Set <code className="text-zinc-300">DATABASE_URL</code> — see{" "}
                  <code className="text-zinc-300">.env.example</code>.
                </>
              )}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
