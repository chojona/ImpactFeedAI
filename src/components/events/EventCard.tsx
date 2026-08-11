"use client";

import { motion } from "framer-motion";

import { CATEGORY_CONFIG } from "@/lib/eventCategories";
import {
  formatNewYorkDateTime,
  formatPlainDate,
  formatReferencePeriod,
  timingStatusLabel,
} from "@/services/events/timing";
import { EventReleaseStats } from "./EventReleaseStats";
import type { AssetReaction, NewsEvent } from "@/types/events";

/**
 * Summary card for one event in the feed.
 *
 * Every block is conditional on the underlying column existing. Most events in
 * the library are bulk-ingested macro prints with no consensus and no
 * explanation, so a card with only a headline, a release line and a reaction row
 * is the normal shape rather than a degraded one.
 */

/** Assets shown on a card before collapsing into a "+N more" count. */
const BADGE_LIMIT = 6;

type Props = { event: NewsEvent };
type MeasuredAsset = AssetReaction & { percentChange: number };

const hasMeasuredOneDayMove = (
  asset: AssetReaction,
): asset is MeasuredAsset => asset.percentChange !== null;

function timingLine(event: NewsEvent): string {
  const status = timingStatusLabel(event.timing.status);
  const displayedStatus =
    !event.timing.reactionEligible &&
    (event.timing.status === "VERIFIED" ||
      event.timing.status === "SCHEDULED")
      ? "Timing provenance incomplete"
      : status;
  const exact = formatNewYorkDateTime(event.timing.releaseAt);
  if (exact !== null) {
    if (event.timing.reactionEligible) return exact;
    return `${exact} · ${displayedStatus}`;
  }

  const releaseDate = formatPlainDate(event.timing.releaseDate);
  if (releaseDate !== null) return `${releaseDate} · ${displayedStatus}`;

  const reference = event.releases
    .map((release) => formatReferencePeriod(release.referencePeriodStart))
    .find((value): value is string => value !== null);
  if (reference !== undefined) {
    return `Reference ${reference} · ${displayedStatus}`;
  }
  return displayedStatus;
}

export function EventCard({ event }: Props) {
  const categoryColor = CATEGORY_CONFIG[event.category].color;
  const measured = event.assets.filter(hasMeasuredOneDayMove);
  const shown = measured.slice(0, BADGE_LIMIT);
  const hidden = measured.length - shown.length;

  return (
    <motion.article
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 320, damping: 24 }}
      className="flex h-full flex-col gap-4 rounded-lg border border-white/5 bg-white/[0.02] p-5 transition-colors hover:border-white/10 hover:bg-white/[0.04]"
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className="rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]"
          style={{
            backgroundColor: `${categoryColor}20`,
            color: categoryColor,
            border: `1px solid ${categoryColor}40`,
          }}
        >
          {event.category}
        </span>
        {event.timing.releaseAt !== null ? (
          <time
            className={`text-right text-xs ${
              event.timing.reactionEligible
                ? "text-zinc-500"
                : "text-amber-300/70"
            }`}
            dateTime={event.timing.releaseAt}
            title={timingStatusLabel(event.timing.status)}
          >
            {timingLine(event)}
          </time>
        ) : (
          <span
            className="text-right text-xs text-amber-300/70"
            title={timingStatusLabel(event.timing.status)}
          >
            {timingLine(event)}
          </span>
        )}
      </div>

      <h3 className="text-lg font-semibold leading-snug text-zinc-50">
        {event.title}
      </h3>

      {event.release && (
        <EventReleaseStats
          release={event.release}
          category={event.category}
          compact
        />
      )}

      {event.explanation && (
        <p className="line-clamp-3 text-sm leading-relaxed text-zinc-400">
          {event.explanation}
        </p>
      )}

      <div className="mt-auto">
        {measured.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {shown.map((asset) => (
              <AssetBadge key={asset.symbol} asset={asset} />
            ))}
            {hidden > 0 && (
              <span className="flex items-center rounded-md bg-zinc-700/40 px-2 py-1 text-xs text-zinc-400">
                +{hidden}
              </span>
            )}
          </div>
        ) : (
          <p className="text-xs text-zinc-600">
            {event.timing.reactionEligible
              ? "No current-version 1D reactions measured"
              : "Reactions suppressed — release timing is not trusted"}
          </p>
        )}
      </div>
    </motion.article>
  );
}

function AssetBadge({ asset }: { asset: MeasuredAsset }) {
  const pct = asset.percentChange;
  const colorClass =
    asset.direction === "UP"
      ? "bg-[#00FF94]/10 text-[#00FF94]"
      : asset.direction === "DOWN"
        ? "bg-red-500/10 text-red-400"
        : "bg-zinc-700/40 text-zinc-300";

  return (
    <span
      className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ${colorClass}`}
      title={`${asset.name} — pre-release baseline to one session after the release session`}
    >
      <span className="font-semibold text-zinc-200">{asset.symbol}</span>
      <span className="font-mono font-semibold">
        {pct > 0 ? "+" : ""}
        {pct.toFixed(2)}%
      </span>
    </span>
  );
}
