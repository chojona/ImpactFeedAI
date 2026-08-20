import { CATEGORY_CONFIG } from "@/lib/eventCategories";
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
 * Timing renders at the most precise level the record actually supports, and
 * says so at each step down: an exact instant, else a publication date with the
 * time explicitly called unavailable, else the reference period the statistic
 * measures, else nothing at all. It never fabricates a clock time to fill the
 * slot.
 */

interface Props {
  event: NewsEvent;
}

export function EventHeader({ event }: Props) {
  const categoryColor = CATEGORY_CONFIG[event.category].color;
  const timing = timingDisplay(event.timing);
  const exact = formatNewYorkDateTime(event.timing.releaseAt);
  const date = formatPlainDate(event.timing.releaseDate);
  const reference = event.releases
    .map((release) => formatReferencePeriod(release.referencePeriodStart))
    .find((value): value is string => value !== null);

  return (
    <header>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="rounded-md px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em]"
          style={{
            backgroundColor: `${categoryColor}1F`,
            color: categoryColor,
            border: `1px solid ${categoryColor}3D`,
          }}
        >
          {event.category}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">
          {event.eventType.replace(/_/g, " ")}
        </span>
      </div>

      <h1 className="mt-4 text-2xl font-semibold leading-tight tracking-tight text-zinc-50 sm:text-4xl">
        {event.title}
      </h1>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <ReleaseInstant
          exact={exact}
          releaseAtIso={event.timing.releaseAt}
          date={date}
          releaseDateIso={event.timing.releaseDate}
          reference={reference}
          trusted={event.timing.reactionEligible}
        />
        {event.sourceUrl !== null && (
          <a
            href={event.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-xs font-medium text-[#00FF94] underline decoration-[#00FF94]/30 underline-offset-2 transition hover:decoration-[#00FF94]"
          >
            Event source ↗
          </a>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <TimingBadge display={timing} />
        <ReactionBadge available={event.assets.length > 0} />
      </div>

      <div
        className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
          timing.tone === "trusted"
            ? "border-[#00FF94]/12 bg-[#00FF94]/[0.025] text-zinc-400"
            : "border-amber-300/12 bg-amber-300/[0.025] text-amber-100/70"
        }`}
      >
        <p>{timing.explanation}</p>
        {event.timing.source !== null && (
          <p className="mt-1 text-xs text-zinc-500">
            Timing source: {event.timing.source}
          </p>
        )}
      </div>
    </header>
  );
}

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
  if (exact !== null && releaseAtIso !== null) {
    return (
      <time
        dateTime={releaseAtIso}
        className={`font-mono text-sm ${
          trusted ? "text-zinc-300" : "text-amber-300/80"
        }`}
      >
        {exact}
      </time>
    );
  }
  if (date !== null && releaseDateIso !== null) {
    return (
      <time dateTime={releaseDateIso} className="font-mono text-sm text-amber-300/80">
        {date} · exact release time unavailable
      </time>
    );
  }
  if (reference !== undefined) {
    return (
      <span className="font-mono text-sm text-amber-300/80">
        Reference period {reference} · release timing unavailable
      </span>
    );
  }
  return (
    <span className="font-mono text-sm text-amber-300/80">
      Release timing unavailable
    </span>
  );
}
