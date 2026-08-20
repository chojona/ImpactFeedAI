import { isDatabaseConfigured } from "@/lib/prisma";
import {
  getLibrarySummary,
  type LibrarySummary,
} from "@/services/events/eventQueries";

/**
 * Library figures, read from Postgres.
 *
 * This replaced a hardcoded strip that claimed "142 events catalogued" and
 * "coverage since 2019" — numbers with no relationship to the database. Every
 * figure here is a row count or a column extreme.
 *
 * When there is no database to read, the section renders nothing at all. An
 * absent strip is honest; a strip of zeroes reads as a broken page, and a strip
 * of plausible defaults is the problem this component exists to fix.
 */
async function loadSummary(): Promise<LibrarySummary | null> {
  if (!isDatabaseConfigured()) return null;
  try {
    return await getLibrarySummary();
  } catch (error) {
    console.error("[landing] library summary query failed:", error);
    return null;
  }
}

export async function LibraryStats() {
  const summary = await loadSummary();
  if (summary === null || summary.events === 0) return null;

  const span =
    summary.earliest === null || summary.latest === null
      ? null
      : `${summary.earliest.slice(0, 4)}–${summary.latest.slice(0, 4)}`;

  const metrics: { label: string; value: string; note?: string }[] = [
    { label: "Events ingested", value: summary.events.toLocaleString() },
    {
      label: "With a measured reaction",
      value: summary.measuredEvents.toLocaleString(),
      note: "requires a sourced release instant",
    },
    {
      label: "Instruments tracked",
      value: summary.instruments.toLocaleString(),
    },
    ...(span === null ? [] : [{ label: "Coverage span", value: span }]),
  ];

  return (
    <section
      aria-label="Library figures"
      className="border-b border-white/[0.06] bg-white/[0.015]"
    >
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <dl className="grid grid-cols-2 divide-white/[0.06] md:grid-cols-4 md:divide-x">
          {metrics.map((metric, index) => (
            <div
              key={metric.label}
              className={`flex flex-col gap-1 px-5 py-6 md:px-8 ${
                index === 0 ? "md:pl-0" : ""
              }`}
            >
              <dt className="font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-400">
                {metric.label}
              </dt>
              <dd className="font-mono text-2xl font-semibold tabular-nums tracking-tight text-zinc-50">
                {metric.value}
              </dd>
              {metric.note !== undefined && (
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-600">
                  {metric.note}
                </p>
              )}
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
