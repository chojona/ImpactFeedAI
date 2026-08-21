import { DataStatePanel } from "@/components/ui/DataStatePanel";
import type { CategoryCoverage } from "@/services/events/eventQueries";

/**
 * The state most categories are in today, rendered as an answer rather than as
 * a failure.
 *
 * It names the specific reason from the category's own coverage counts instead
 * of printing a generic "no data". A researcher looking at an empty pattern
 * needs to know whether the events are missing, the release timing is missing,
 * or the prices are missing — three different problems with three different
 * fixes, and only one of them is about this page.
 *
 * The redesign routed it through the shared `DataStatePanel` so this reads in
 * the same visual language as an unmeasured cell on an event page, and picks the
 * state that matches the cause: nothing ingested is `pending` (a queued task),
 * whereas timing that no source publishes is `unsupported` (a permanent limit
 * of the upstream data). Those were previously the same grey box.
 */

interface Props {
  coverage: CategoryCoverage;
}

export function InsufficientData({ coverage }: Props) {
  const reasons: string[] = [];
  if (coverage.events === 0) {
    reasons.push("No events of this type have been ingested yet.");
  } else if (coverage.trustedTiming === 0) {
    reasons.push(
      `None of the ${coverage.events.toLocaleString()} events in this category has a verified or officially scheduled release instant, so no price window can be anchored.`,
    );
  } else if (coverage.measuredEvents === 0) {
    reasons.push(
      `${coverage.trustedTiming.toLocaleString()} events have trusted timing but no current-version price reaction stored yet. Run the price backfill for them.`,
    );
  }

  if (coverage.referencePeriodOnly > 0) {
    reasons.push(
      `${coverage.referencePeriodOnly.toLocaleString()} events are bulk FRED/BLS rows that carry only the period the statistic measures — the source publishes no release instant.`,
    );
  }
  if (coverage.untrustedTiming > 0) {
    reasons.push(
      `${coverage.untrustedTiming.toLocaleString()} events have an inferred or uncited timestamp, which deliberately fails closed.`,
    );
  }

  // "Nothing here yet" and "nothing here from this source, ever" are different
  // claims. The first is a backlog; the second is a limit of the provider.
  const state =
    coverage.events === 0 || coverage.measuredEvents === 0
      ? coverage.trustedTiming > 0
        ? "pending"
        : "unsupported"
      : "unavailable";

  return (
    <DataStatePanel
      state={state}
      title="Not enough verified observations for a pattern"
      footnote="This is a data-provider gap, not a rendering one. Fabricating a release time would produce a chart that looks identical to a correct one."
    >
      A pattern needs events whose exact release instant is backed by a named
      source. Until that exists, this category has nothing that can be
      aggregated without inventing the missing timing.
      {reasons.length > 0 && (
        <span className="mt-3 block space-y-2">
          {reasons.map((reason) => (
            <span key={reason} className="flex gap-2.5 text-ink-3">
              <span
                aria-hidden
                className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink-4"
              />
              {reason}
            </span>
          ))}
        </span>
      )}
    </DataStatePanel>
  );
}
