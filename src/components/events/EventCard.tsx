import { CATEGORY_CONFIG } from "@/lib/eventCategories";
import { CategoryBadge, InstrumentBadge } from "@/components/ui/CategoryBadge";
import { DataStateNote } from "@/components/ui/DataStatePanel";
import { MiniReactionBars } from "@/components/reactions/MiniReactionBars";
import { ReactionIndicator } from "@/components/reactions/ReactionIndicator";
import { directionOf } from "@/components/reactions/reactionTone";
import { ReleaseValueInline } from "./ReleaseValues";
import { eventWhenDisplay } from "@/services/events/timing";
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
 * ### Colour, added in the second visual pass
 *
 * Three additions, each solving a specific scanning problem the grey version
 * had:
 *
 *   - a **category spine** down the left edge, so twelve cards are sortable by
 *     eye into six categories before a word is read;
 *   - a **directionally tinted reaction block**, which turns the feed from a
 *     wall of grey rectangles with coloured digits into a wall of green and red
 *     *regions*;
 *   - a **brand hover border**, so the card announces it is a link.
 *
 * The tint is never the only signal: the sign, the arrow glyph and the
 * accessible name all still come from `ReactionIndicator`.
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
  const direction = directionOf(headline?.value ?? null);
  const categoryColor = CATEGORY_CONFIG[event.category].color;

  return (
    <article
      className={`surface-lift relative flex flex-col gap-3 overflow-hidden rounded-lg border p-4 pl-5 transition-colors duration-150 sm:p-[18px] sm:pl-[22px] ${
        headline === null
          ? "border-line bg-surface-1/60 group-hover:border-line-brand group-hover:bg-surface-2"
          : "border-line bg-surface-1 group-hover:border-line-brand group-hover:bg-surface-2"
      }`}
    >
      {/* Category spine. Three pixels of the category's own colour down the
          left edge of every card — the cheapest possible way to make a wall of
          twelve cards scannable by category before any text is read, and it
          costs no vertical space. */}
      <span
        aria-hidden
        className="absolute inset-y-3 left-0 w-[3px] rounded-full opacity-80"
        style={{ backgroundColor: categoryColor }}
      />

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
        // The reaction block is tinted in the direction of the move. Across a
        // grid of cards this is the single strongest scanning aid in the feed:
        // green and red *regions*, not just green and red digits.
        <div
          className={`rounded-md border px-3 py-2.5 ${
            direction === "UP"
              ? "border-pos/20 bg-pos-tint"
              : direction === "DOWN"
                ? "border-neg/20 bg-neg-tint"
                : "border-line bg-surface-2"
          }`}
        >
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
        <div className="rounded-md border border-line bg-canvas/55 px-3 py-2.5">
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
 * The most precise "when" the record supports, and no more.
 *
 * The selection lives in `services/events/timing.ts` so the card and the event
 * header cannot disagree about which level a row qualifies for. This renders
 * two lines: the date itself, and a caption naming the level it came from, so a
 * drop in precision is visible rather than silent.
 *
 * A known date is set in the normal ink even when its release timing is
 * unverified. Amber is reserved for the caption — the part that is actually
 * qualified — because thirty of fifty cards carry an occurrence date with no
 * sourced release time, and colouring the date itself as a warning states that
 * the *date* is doubtful when it is the *timing* that is.
 */
function WhenLine({ event }: { event: NewsEvent }) {
  const when = eventWhenDisplay(event);
  const trusted = when.tone === "trusted";

  const content = (
    <>
      <span
        className={`num block text-[11px] ${
          when.dateKnown ? "text-ink-2" : "text-warn/85"
        }`}
      >
        {when.text}
      </span>
      {/* Deliberately one notch quieter than the state line below the title.
          Two amber items per card, saying the same thing twice, made the
          majority of the feed read as a wall of warnings. */}
      <span
        className={`block font-mono text-[9px] uppercase tracking-[0.12em] ${
          trusted ? "text-ink-4" : "text-warn/70"
        }`}
      >
        {when.label}
      </span>
    </>
  );

  return (
    <span className="shrink-0 text-right" title={when.explanation}>
      {when.dateTime === null ? (
        content
      ) : (
        <time dateTime={when.dateTime}>{content}</time>
      )}
    </span>
  );
}
