import { CATEGORY_CONFIG } from "@/lib/eventCategories";
import { MiniReactionBars } from "@/components/reactions/MiniReactionBars";
import { ReleaseValueInline } from "./ReleaseValues";
import {
  formatNewYorkDate,
  formatPlainDate,
  formatReferencePeriod,
  timingDisplay,
} from "@/services/events/timing";
import { pctForWindow } from "@/services/events/reactionView";
import type { NewsEvent } from "@/types/events";

/**
 * Summary card for one event in the feed.
 *
 * Built for scanning: category, when, the four release values, and the
 * strongest measured reactions — enough to decide whether to open the event
 * without opening it.
 *
 * Both the complete and the incomplete case are designed states. Most rows in
 * the library are bulk-ingested macro prints with no consensus and untrusted
 * timing, so a card reading "n/a" under Consensus and "Reaction unavailable"
 * below is the *normal* shape, and it is laid out to look deliberate rather
 * than broken. What it never does is fill either gap with a zero.
 *
 * Not a client component: the hover lift is a CSS transform rather than a
 * Framer Motion spring, which removes per-card JavaScript from a list that
 * grows without bound as the reader scrolls.
 */

/** The horizon the feed headlines, matching `NewsEvent.primaryWindow`. */
const FEED_WINDOW = "1d" as const;

interface Props {
  event: NewsEvent;
}

export function EventCard({ event }: Props) {
  const categoryColor = CATEGORY_CONFIG[event.category].color;
  const timing = timingDisplay(event.timing);
  const measured = event.assets.filter(
    (asset) => pctForWindow(asset, FEED_WINDOW) !== null,
  );

  return (
    <article className="flex h-full flex-col gap-3.5 rounded-lg border border-white/[0.06] bg-white/[0.015] p-4 transition duration-150 hover:-translate-y-0.5 hover:border-white/12 hover:bg-white/[0.035] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <span
          className="shrink-0 rounded-md px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.16em]"
          style={{
            backgroundColor: `${categoryColor}1F`,
            color: categoryColor,
            border: `1px solid ${categoryColor}3D`,
          }}
        >
          {event.category}
        </span>
        <WhenLine event={event} />
      </div>

      <h3 className="text-[15px] font-semibold leading-snug text-zinc-50">
        {event.title}
      </h3>

      {event.release !== null && (
        <div className="rounded-md border border-white/[0.05] bg-black/20 px-3 py-2.5">
          <p className="mb-1.5 truncate font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-600">
            {event.release.metricName}
          </p>
          <ReleaseValueInline
            release={event.release}
            category={event.category}
          />
        </div>
      )}

      <div className="mt-auto border-t border-white/[0.05] pt-3">
        {measured.length > 0 ? (
          <MiniReactionBars assets={event.assets} window={FEED_WINDOW} />
        ) : (
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Reaction unavailable
            </p>
            <p className="mt-1 text-[11px] leading-snug text-zinc-600">
              {event.timing.reactionEligible
                ? "No current-version price window is stored for this release."
                : timing.label}
            </p>
          </div>
        )}
      </div>
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

  const tone =
    timing.tone === "trusted" ? "text-zinc-400" : "text-amber-300/70";

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
      <span className={`block font-mono text-[11px] ${tone}`}>{body}</span>
      <span
        className={`block font-mono text-[9px] uppercase tracking-[0.12em] ${
          timing.tone === "trusted" ? "text-zinc-600" : "text-amber-300/50"
        }`}
      >
        {timing.tone === "trusted" ? "Verified timing" : timing.label}
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
