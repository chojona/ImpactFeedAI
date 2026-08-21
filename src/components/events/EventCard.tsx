import { CategoryBadge, InstrumentBadge } from "@/components/ui/CategoryBadge";
import { DataStateNote } from "@/components/ui/DataStatePanel";
import { MiniReactionBars } from "@/components/reactions/MiniReactionBars";
import { ReactionIndicator } from "@/components/reactions/ReactionIndicator";
import { ReleaseValueInline } from "./ReleaseValues";
import {
  formatNewYorkDate,
  formatPlainDate,
  formatReferencePeriod,
  timingDisplay,
} from "@/services/events/timing";
import {
  WINDOW_LABELS,
  pctForWindow,
  strongestAtWindow,
} from "@/services/events/reactionView";
import type { NewsEvent } from "@/types/events";

/**
 * Summary card for one event in the feed.
 *
 * Built for scanning: category, when, the headline move, and — quietly — what
 * printed. Enough to decide whether to open the event without opening it.
 *
 * ### What the redesign changed
 *
 * Two things, both about scanning a wall of these.
 *
 * **Order.** The release values used to come first and the reaction last, so
 * the number a reader scans for — the move — sat at a different height in every
 * card depending on how much release data existed above it. The headline move
 * is now directly under the title, in a fixed position, and the release strip
 * is demoted below it. Direction and magnitude are the first coloured thing in
 * the card.
 *
 * **Height.** The card used to be `h-full` with the reaction block pushed down
 * by `mt-auto`, which made every card in a row as tall as the tallest one and
 * left the ~60% of events with no measured reaction showing a large blank
 * void — the single worst instance of the "missing data as empty whitespace"
 * failure the brief calls out. Cards now size to their content, and absence is
 * one explicit line rather than a hole.
 *
 * Not a client component: the hover treatment is CSS, which removes per-card
 * JavaScript from a list that grows without bound as the reader scrolls.
 */

/** The horizon the feed headlines, matching `NewsEvent.primaryWindow`. */
const FEED_WINDOW = "1d" as const;

interface Props {
  event: NewsEvent;
}

export function EventCard({ event }: Props) {
  const headline = strongestAtWindow(event.assets, FEED_WINDOW);
  const measuredCount = event.assets.filter(
    (asset) => pctForWindow(asset, FEED_WINDOW) !== null,
  ).length;

  return (
    <article
      className={`flex flex-col gap-3 rounded-lg border p-4 transition-colors duration-150 sm:p-[18px] ${
        headline === null
          ? "border-line bg-white/[0.008] group-hover:border-line-strong group-hover:bg-white/[0.025]"
          : "border-line bg-surface-1 group-hover:border-line-strong group-hover:bg-surface-2"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <CategoryBadge category={event.category} size="xs" />
        <WhenLine event={event} />
      </div>

      <h3 className="text-[15px] font-semibold leading-snug text-ink">
        {event.title}
      </h3>

      {/* The scan target, in a fixed position on every card. */}
      {headline === null ? (
        // The timing status is already stated top-right, so this line says only
        // what follows from it. Repeating "unverified timing" in both corners of
        // the same card was noise, not emphasis.
        <DataStateNote
          state={event.timing.reactionEligible ? "pending" : "suppressed"}
          className="border-t border-line pt-3"
        >
          {event.timing.reactionEligible
            ? "Price backfill not run yet"
            : "Reaction withheld"}
        </DataStateNote>
      ) : (
        <div className="border-t border-line pt-3">
          <div className="flex items-baseline justify-between gap-3">
            <InstrumentBadge
              symbol={headline.asset.symbol}
              name={headline.asset.name}
            />
            <span className="flex shrink-0 items-baseline gap-1.5">
              <ReactionIndicator
                value={headline.value}
                symbol={headline.asset.symbol}
                windowLabel={`over ${WINDOW_LABELS[FEED_WINDOW]}`}
                size="md"
              />
              <span className="eyebrow">{WINDOW_LABELS[FEED_WINDOW]}</span>
            </span>
          </div>
          <div className="mt-2.5">
            <MiniReactionBars
              assets={event.assets}
              window={FEED_WINDOW}
              limit={3}
              measuredCount={measuredCount}
            />
          </div>
        </div>
      )}

      {event.release !== null && (
        <div className="rounded-md border border-line bg-black/25 px-3 py-2.5">
          <p className="eyebrow mb-2 truncate text-[9px]">
            {event.release.metricName}
          </p>
          <ReleaseValueInline
            release={event.release}
            category={event.category}
          />
        </div>
      )}
    </article>
  );
}

/**
 * The most precise "when" the record supports, and no more. An exact instant
 * where one is sourced; otherwise the publication date, the reference period,
 * or nothing — each labelled with the timing status so the drop in precision is
 * visible rather than silent.
 */
function WhenLine({ event }: { event: NewsEvent }) {
  const timing = timingDisplay(event.timing);
  const exact = formatNewYorkDate(event.timing.releaseAt);
  const date = formatPlainDate(event.timing.releaseDate);
  const reference = event.releases
    .map((release) => formatReferencePeriod(release.referencePeriodStart))
    .find((value): value is string => value !== null);

  const trusted = timing.tone === "trusted";

  const body =
    exact !== null
      ? exact
      : date !== null
        ? date
        : reference !== undefined
          ? `Ref ${reference}`
          : "No release date";

  const dateTime =
    exact !== null
      ? (event.timing.releaseAt ?? undefined)
      : date !== null
        ? (event.timing.releaseDate ?? undefined)
        : undefined;

  const content = (
    <>
      {/* Deliberately one notch quieter than the state line below the title.
          Two amber items per card, saying the same thing twice, made the
          majority of the feed read as a wall of warnings. */}
      <span
        className={`num block text-[11px] ${
          trusted ? "text-ink-2" : "text-warn/85"
        }`}
      >
        {body}
      </span>
      <span className="block font-mono text-[9px] uppercase tracking-[0.12em] text-ink-4">
        {trusted ? "Verified timing" : timing.label}
      </span>
    </>
  );

  return (
    <span className="shrink-0 text-right" title={timing.explanation}>
      {dateTime === undefined ? (
        content
      ) : (
        <time dateTime={dateTime}>{content}</time>
      )}
    </span>
  );
}
