import Link from "next/link";

import { ReactionDistribution } from "@/components/patterns/ReactionDistribution";
import {
  distributionFor,
  type ReactionObservation,
} from "@/services/analytics/patternAnalysis";
import {
  WINDOW_DESCRIPTIONS,
  WINDOW_LABELS,
  pctForWindow,
  strongestAtWindow,
} from "@/services/events/reactionView";
import type {
  AssetReaction,
  EventCategory,
  ReactionWindow,
} from "@/types/events";

/**
 * This event's own reaction, placed inside the distribution of comparable ones.
 *
 * The event page already reports what happened and what the category typically
 * does, but until those two are on the same axis the reader has to hold a
 * median in their head and compare it to a number three sections up. A median
 * beside a single reading also cannot express the thing that actually matters —
 * whether this reaction was ordinary or extreme — because that is a statement
 * about the spread, not the centre.
 *
 * Server-rendered. The instrument is fixed to the event's largest one-session
 * mover rather than being switchable, which keeps the whole section free of
 * client JavaScript; the pattern library is linked for anyone who wants to pivot
 * the instrument or horizon, and it already does that from the URL.
 *
 * The event's own observation is part of the distribution it is compared
 * against. That is deliberate and stated in the caption: excluding it would
 * quietly report a different median than the pattern library shows for the same
 * query, and two pages disagreeing about the same aggregate is worse than a
 * sample of nine that contains the event you are reading about.
 */

/** The horizon the rest of the app headlines. */
const WINDOW: ReactionWindow = "1d";

interface Props {
  eventId: string;
  category: EventCategory;
  /** Reactions belonging to this event. Already eligibility-gated. */
  assets: readonly AssetReaction[];
  /** Every comparable observation in the category. */
  observations: readonly ReactionObservation[];
}

export function EventInHistory({
  eventId,
  category,
  assets,
  observations,
}: Props) {
  const symbol = focusSymbol(assets, observations, category);
  if (symbol === null) return null;

  const points = distributionFor(observations, category, symbol, WINDOW);
  if (points.length === 0) return null;

  return (
    <section aria-labelledby="event-in-history">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3
          id="event-in-history"
          className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500"
        >
          This event vs. {category} history · {symbol} ·{" "}
          {WINDOW_LABELS[WINDOW]}
        </h3>
        <Link
          href={`/patterns?cat=${category}&sym=${encodeURIComponent(
            symbol,
          )}&h=${WINDOW}`}
          className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 transition hover:text-[#00FF94]"
        >
          Change instrument →
        </Link>
      </div>
      <p className="mb-4 max-w-2xl text-[13px] text-zinc-500">
        Every {category} event in the library with a sourced release instant and
        a measured {symbol} move {WINDOW_DESCRIPTIONS[WINDOW]}. The ringed dot is
        this release.
      </p>
      <ReactionDistribution
        points={points}
        symbol={symbol}
        window={WINDOW}
        selectedEventId={eventId}
      />
    </section>
  );
}

/**
 * The instrument to place on the axis: this event's largest one-session mover,
 * provided the category has history for it.
 *
 * Falling back matters more than it looks. The biggest mover on a given event
 * can be an instrument the rest of the category has never been measured
 * against — XLE and XLK have no one-hour coverage at all, and a thin symbol can
 * produce a one-point "distribution" that says nothing. So the first choice
 * with comparable history wins, and if none has any, the section renders
 * nothing rather than a chart of one dot.
 */
function focusSymbol(
  assets: readonly AssetReaction[],
  observations: readonly ReactionObservation[],
  category: EventCategory,
): string | null {
  const withHistory = new Set(
    observations
      .filter(
        (o) => o.category === category && o.values[WINDOW] !== null,
      )
      .map((o) => o.symbol),
  );

  const strongest = strongestAtWindow(assets, WINDOW);
  if (strongest && withHistory.has(strongest.asset.symbol)) {
    return strongest.asset.symbol;
  }

  const measured = assets
    .filter((a) => pctForWindow(a, WINDOW) !== null)
    .map((a) => a.symbol)
    .find((symbol) => withHistory.has(symbol));

  return measured ?? null;
}
