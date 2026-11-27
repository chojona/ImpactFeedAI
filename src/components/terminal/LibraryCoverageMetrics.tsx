import { MetricCell, MetricRow } from "@/components/ui/Metric";
import { Panel } from "@/components/ui/Panel";
import type { LibraryCoverage } from "@/services/events/eventQueries";

/**
 * Four library totals shared by Brief, Patterns and Quality.
 *
 * Extracted so the personal terminal does not drift into three different
 * spellings of the same coverage story. Every figure is a Postgres count.
 */
export function LibraryCoverageMetrics({
  coverage,
  className,
}: {
  coverage: LibraryCoverage;
  className?: string;
}) {
  const { totals } = coverage;
  return (
    <Panel tone="brand" padding="md" className={className ?? "w-full lg:w-auto"}>
      <MetricRow columns={4} aria-label="Library totals">
        <MetricCell
          label="Events"
          value={totals.events.toLocaleString()}
          size="md"
          state="measured"
          note="ingested"
        />
        <MetricCell
          label="Verified timing"
          value={totals.trustedTiming.toLocaleString()}
          size="md"
          state="measured"
          note="can be anchored"
        />
        <MetricCell
          label="Priced"
          value={totals.measuredEvents.toLocaleString()}
          size="md"
          tone={totals.measuredEvents > 0 ? "brand" : "neutral"}
          state="measured"
          note="reaction measured"
        />
        <MetricCell
          label="Consensus"
          value={
            totals.consensusVerified > 0
              ? totals.consensusVerified.toLocaleString()
              : null
          }
          size="md"
          state="unsupported"
          absenceLabel="None"
          note="verified forecast"
          noteTone={totals.consensusVerified > 0 ? "muted" : "caution"}
        />
      </MetricRow>
    </Panel>
  );
}
