import { MetricCell, MetricRow } from "@/components/ui/Metric";
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

  // Labels are one word each. The previous set included "With a measured
  // reaction", which wrapped to two lines in a four-column strip and pushed
  // that one value a line lower than its neighbours — the numbers in a metric
  // row have to share a baseline to be comparable at a glance.
  const metrics: {
    label: string;
    value: string;
    note?: string;
    highlight?: boolean;
  }[] = [
    {
      label: "Events",
      value: summary.events.toLocaleString(),
      note: "ingested",
    },
    {
      label: "Priced",
      value: summary.measuredEvents.toLocaleString(),
      note: "reaction measured",
      highlight: true,
    },
    {
      label: "Instruments",
      value: summary.instruments.toLocaleString(),
      note: "distinct symbols",
    },
    ...(span === null
      ? []
      : [{ label: "Coverage", value: span, note: "release years" }]),
  ];

  return (
    <section
      aria-label="Library figures"
      className="border-b border-line bg-surface-1"
    >
      <div className="mx-auto max-w-6xl px-5 py-7 sm:px-8">
        <MetricRow
          columns={4}
          aria-label="Library figures"
          className="[&>*]:md:px-8 [&>*:first-child]:md:pl-0"
        >
          {metrics.map((metric) => (
            <MetricCell
              key={metric.label}
              label={metric.label}
              value={metric.value}
              size="lg"
              tone={metric.highlight === true ? "brand" : "neutral"}
              state="measured"
              note={metric.note}
            />
          ))}
        </MetricRow>
      </div>
    </section>
  );
}
