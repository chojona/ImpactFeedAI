import { CalendarClock, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { CategoryBadge } from "@/components/ui/CategoryBadge";
import {
  formatNewYorkDateTime,
  formatPlainDate,
  formatReferencePeriod,
  timingDisplay,
} from "@/services/events/timing";
import { ReactionBadge, TimingBadge } from "./StatusBadges";
import type { NewsEvent } from "@/types/events";

/**
 * Identity, timing and provenance for one event.
 *
 * The hierarchy is deliberate: what happened, when it happened, and how much
 * the "when" can be trusted — in that order, because the third answer is what
 * decides whether anything below it on the page is admissible evidence.
 *
 * What changed in the redesign is how loudly the third answer speaks. It was
 * previously a full bordered callout directly under the title on *every* event,
 * including the ones where the timing is fine — so the most prominent block on
 * a well-sourced page was a paragraph confirming that nothing was wrong, and on
 * a badly-sourced one the same sentence appeared twice within a screen. The
 * header now states the provenance in a single line and the consequence — that
 * no reaction can be published — is rendered where the reaction would have
 * been.
 *
 * Timing still renders at the most precise level the record supports, and says
 * so at each step down: an exact instant, else a publication date with the time
 * explicitly called unavailable, else the reference period the statistic
 * measures, else nothing at all. It never fabricates a clock time.
 */

interface Props {
  event: NewsEvent;
}

export function EventHeader({ event }: Props) {
  const timing = timingDisplay(event.timing);
  const exact = formatNewYorkDateTime(event.timing.releaseAt);
  const date = formatPlainDate(event.timing.releaseDate);
  const reference = event.releases
    .map((release) => formatReferencePeriod(release.referencePeriodStart))
    .find((value): value is string => value !== null);

  // `eventType` is often the same word as `category` (GEOPOLITICAL, TARIFF), and
  // printing both produced a visible "GEOPOLITICAL GEOPOLITICAL" stutter beside
  // the title. The storage vocabulary is only worth showing where it says
  // something the category does not.
  const eventTypeLabel = event.eventType.replace(/_/g, " ");
  const showEventType = eventTypeLabel !== event.category;

  return (
    <header>
      <div className="flex flex-wrap items-center gap-2">
        <CategoryBadge category={event.category} />
        {showEventType && <span className="eyebrow">{eventTypeLabel}</span>}
      </div>

      <h1 className="mt-4 max-w-4xl text-[26px] font-semibold leading-[1.15] tracking-tight text-ink sm:text-[38px]">
        {event.title}
      </h1>

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <ReleaseInstant
          exact={exact}
          releaseAtIso={event.timing.releaseAt}
          date={date}
          releaseDateIso={event.timing.releaseDate}
          reference={reference}
          trusted={event.timing.reactionEligible}
        />
        <span aria-hidden className="h-4 w-px bg-line-strong" />
        <TimingBadge display={timing} />
        <ReactionBadge
          available={event.assets.length > 0}
          eligible={event.timing.reactionEligible}
        />
        {event.sourceUrl !== null && (
          <a
            href={event.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 rounded text-xs font-medium text-ink-2 underline decoration-line-strong underline-offset-[3px] transition-colors hover:text-ink hover:decoration-ink-3"
          >
            Event source
            <ExternalLink aria-hidden className="h-3 w-3" strokeWidth={2} />
          </a>
        )}
      </div>

      {/* One line, either way. The *reason* a reaction is withheld belongs
          beside the reaction section rather than here — repeating it in both
          places is what made the previous page state the same sentence twice
          within one screen. */}
      <p className="mt-4 max-w-3xl text-xs leading-relaxed">
        {event.timing.reactionEligible ? (
          event.timing.source !== null && (
            <>
              <span className="text-ink-3">Timing source</span>{" "}
              <span className="text-ink-4">· {event.timing.source}</span>
            </>
          )
        ) : (
          <>
            <span className="text-warn">{timing.explanation}</span>{" "}
            <span className="text-ink-4">
              {event.timing.source === null
                ? "No timing source is recorded."
                : `Timing source: ${event.timing.source}`}
            </span>
          </>
        )}
      </p>
    </header>
  );
}

/**
 * The most precise "when" the record supports, and no more.
 *
 * Promoted from a 12px mono aside to the primary metadata line, because "when
 * did this print" is one of the six questions the page has to answer above the
 * fold. A degraded precision level keeps its amber tone and states what is
 * missing in words — the drop is visible rather than silent.
 */
function ReleaseInstant({
  exact,
  releaseAtIso,
  date,
  releaseDateIso,
  reference,
  trusted,
}: {
  exact: string | null;
  releaseAtIso: string | null;
  date: string | null;
  releaseDateIso: string | null;
  reference: string | undefined;
  trusted: boolean;
}) {
  const icon = (
    <CalendarClock
      aria-hidden
      className={`h-3.5 w-3.5 shrink-0 ${trusted ? "text-ink-4" : "text-warn"}`}
      strokeWidth={2}
    />
  );

  if (exact !== null && releaseAtIso !== null) {
    return (
      <span className="flex items-center gap-2">
        {icon}
        <time
          dateTime={releaseAtIso}
          className={`num text-[13px] font-medium ${
            trusted ? "text-ink-2" : "text-warn"
          }`}
        >
          {exact}
        </time>
      </span>
    );
  }
  if (date !== null && releaseDateIso !== null) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        {icon}
        <time dateTime={releaseDateIso} className="num text-[13px] font-medium text-warn">
          {date}
        </time>
        <Badge tone="caution" size="xs">
          Time unavailable
        </Badge>
      </span>
    );
  }
  if (reference !== undefined) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        {icon}
        <span className="num text-[13px] font-medium text-warn">
          Reference period {reference}
        </span>
        <Badge tone="caution" size="xs">
          Release timing unavailable
        </Badge>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2">
      {icon}
      <span className="num text-[13px] font-medium text-warn">
        Release timing unavailable
      </span>
    </span>
  );
}
