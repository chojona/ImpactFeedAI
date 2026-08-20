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

  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.015] px-6 py-10">
      <h3 className="text-base font-semibold text-zinc-200">
        Not enough verified historical observations
      </h3>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
        A pattern needs events whose exact release instant is backed by a named
        source. Until that exists, this category has nothing that can be
        aggregated without inventing the missing timing.
      </p>
      {reasons.length > 0 && (
        <ul className="mt-4 max-w-2xl space-y-2 text-sm text-zinc-500">
          {reasons.map((reason) => (
            <li key={reason} className="flex gap-2.5">
              <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-zinc-600" />
              {reason}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-5 text-xs text-zinc-600">
        This is a data-provider gap, not a rendering one. Fabricating a release
        time would produce a chart that looks identical to a correct one.
      </p>
    </div>
  );
}
