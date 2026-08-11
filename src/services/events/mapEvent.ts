/**
 * Database row → presentation shape.
 *
 * The one rule this module exists to enforce: **nothing is invented here.**
 * Every string it produces is either stored text or a formatting of a stored
 * number. Where the database has no value the output is null, and the components
 * are built to render an absence.
 *
 * That constraint is why `summary` reads like a data line rather than prose.
 * `Event.explanation` is the column intended for narrative and nothing populates
 * it yet (see docs/architecture.md — "Event.explanation is a free-text column
 * with no writer"), so the summary is assembled from the release's own numbers.
 * Writing plausible-sounding commentary here would put un-sourced claims in
 * front of the user under the same styling as measured data.
 */
import { assetMeta, compareAssetSymbols } from "@/lib/assets";
import { categoryForEventType } from "@/lib/eventCategories";
import {
  formatMetricSurprise,
  formatMetricValue,
} from "@/services/macro/metrics";
import {
  CURRENT_REACTION_CALCULATION_VERSION,
  reactionTimingEligibility,
} from "@/services/events/timing";
import type {
  AssetReaction,
  ConsensusStatus,
  DataReleaseView,
  Direction,
  EventTimingStatus,
  EventTypeName,
  NewsEvent,
} from "@/types/events";

/** The subset of the Prisma row shape this mapper needs. */
export interface EventRow {
  id: string;
  headline: string;
  eventType: EventTypeName;
  occurredAt: Date;
  releaseAt: Date | null;
  releaseDate: Date | null;
  timingStatus: EventTimingStatus;
  timingSource: string | null;
  sourceUrl: string | null;
  explanation: string | null;
  assetReactions: {
    assetSymbol: string;
    priceAtEvent: number;
    price1h: number | null;
    price1d: number | null;
    price1w: number | null;
    pctChange1h: number | null;
    pctChange1d: number | null;
    pctChange1w: number | null;
    anchorAt: Date | null;
    calculationVersion: number | null;
  }[];
  dataReleases: {
    metricKey: string | null;
    metricName: string;
    referencePeriodStart: Date | null;
    expectedValue: number | null;
    actualValue: number | null;
    priorValue: number | null;
    surpriseMagnitude: number | null;
    actualSource: string | null;
    actualSourceUrl: string | null;
    consensusStatus: ConsensusStatus;
    consensusSource: string | null;
    consensusSourceUrl: string | null;
    consensusAsOf: Date | null;
  }[];
}

const finiteOrNull = (value: number | null): number | null =>
  value !== null && Number.isFinite(value) ? value : null;

const isoInstant = (value: Date | null): string | null =>
  value !== null && Number.isFinite(value.getTime())
    ? value.toISOString()
    : null;

/** SQL DATE values are transported as Date objects but are not instants. */
const isoDay = (value: Date | null): string | null =>
  value !== null && Number.isFinite(value.getTime())
    ? value.toISOString().slice(0, 10)
    : null;

/**
 * Direction of a move. `FLAT` is reserved for a genuine zero; a move that could
 * not be measured yields null so it can be rendered as "—" instead of "0.00%".
 */
function directionOf(pct: number | null): Direction | null {
  if (pct === null || !Number.isFinite(pct)) return null;
  if (pct > 0) return "UP";
  if (pct < 0) return "DOWN";
  return "FLAT";
}

function mapAssetReaction(row: EventRow["assetReactions"][number]): AssetReaction {
  const meta = assetMeta(row.assetSymbol);
  const pct1h = finiteOrNull(row.pctChange1h);
  const pct1d = finiteOrNull(row.pctChange1d);
  const pct1w = finiteOrNull(row.pctChange1w);
  return {
    symbol: row.assetSymbol,
    name: meta.name,
    assetType: meta.assetType,
    priceAtEvent: row.priceAtEvent,
    price1h: finiteOrNull(row.price1h),
    price1d: finiteOrNull(row.price1d),
    price1w: finiteOrNull(row.price1w),
    pct1h,
    pct1d,
    pct1w,
    anchorAt: isoInstant(row.anchorAt),
    calculationVersion: CURRENT_REACTION_CALCULATION_VERSION,
    primaryWindow: pct1d === null ? null : "1d",
    percentChange: pct1d,
    direction: directionOf(pct1d),
  };
}

function mapRelease(
  row: EventRow["dataReleases"][number],
): DataReleaseView {
  const expectedValue = finiteOrNull(row.expectedValue);
  const actualValue = finiteOrNull(row.actualValue);
  const priorValue = finiteOrNull(row.priorValue);
  const surpriseMagnitude = finiteOrNull(row.surpriseMagnitude);
  return {
    metricKey: row.metricKey,
    metricName: row.metricName,
    referencePeriodStart: isoDay(row.referencePeriodStart),
    expectedValue,
    actualValue,
    priorValue,
    surpriseMagnitude,
    expected: formatMetricValue(row.metricName, expectedValue),
    actual: formatMetricValue(row.metricName, actualValue),
    prior: formatMetricValue(row.metricName, priorValue),
    surprise: formatMetricSurprise(row.metricName, surpriseMagnitude),
    surpriseValue: surpriseMagnitude,
    actualSource: row.actualSource,
    actualSourceUrl: row.actualSourceUrl,
    consensusStatus: row.consensusStatus,
    consensusSource: row.consensusSource,
    consensusSourceUrl: row.consensusSourceUrl,
    consensusAsOf: isoInstant(row.consensusAsOf),
  };
}

/**
 * A factual one-liner built only from stored numbers, or null when the event
 * carries no release to describe. Clauses are omitted rather than filled in
 * with a placeholder, so the sentence shrinks to match what is known.
 */
export function buildSummary(release: DataReleaseView | null): string | null {
  if (release === null) return null;
  const parts: string[] = [];
  if (release.actual !== null) parts.push(`actual ${release.actual}`);
  if (release.expected !== null) {
    parts.push(
      release.consensusStatus === "VERIFIED"
        ? `consensus ${release.expected}`
        : `unverified consensus ${release.expected}`,
    );
  }
  if (release.prior !== null) parts.push(`prior ${release.prior}`);
  if (parts.length === 0) return null;
  const surprise =
    release.surprise !== null
      ? ` · ${release.consensusStatus === "VERIFIED" ? "surprise" : "unverified surprise"} ${release.surprise}`
      : "";
  return `${release.metricName} — ${parts.join(" · ")}${surprise}`;
}

/**
 * Releases are sorted before choosing the feed summary so database relation
 * ordering cannot make a multi-metric event change between requests. Detail
 * views retain and render the complete release set.
 */
export function mapEvent(row: EventRow): NewsEvent {
  const timingEligibility = reactionTimingEligibility({
    releaseAt: row.releaseAt,
    timingStatus: row.timingStatus,
    timingSource: row.timingSource,
  });
  const releaseAt = isoInstant(row.releaseAt);
  const occurredAt = row.occurredAt.toISOString();
  const releases = row.dataReleases
    .map(mapRelease)
    .sort(
      (a, b) =>
        a.metricName.localeCompare(b.metricName) ||
        (a.metricKey ?? "").localeCompare(b.metricKey ?? ""),
    );
  const release = releases[0] ?? null;
  const assets = timingEligibility.eligible
    ? row.assetReactions
        .filter(
          (asset) =>
            asset.calculationVersion ===
              CURRENT_REACTION_CALCULATION_VERSION &&
            Number.isFinite(asset.priceAtEvent),
        )
        .map(mapAssetReaction)
        .sort((a, b) => compareAssetSymbols(a.symbol, b.symbol))
    : [];

  return {
    id: row.id,
    title: row.headline,
    date: releaseAt ?? occurredAt,
    occurredAt,
    timing: {
      status: row.timingStatus,
      releaseAt,
      releaseDate: isoDay(row.releaseDate),
      source: row.timingSource,
      reactionEligible: timingEligibility.eligible,
      ineligibilityReason: timingEligibility.reason,
    },
    eventType: row.eventType,
    category: categoryForEventType(row.eventType),
    summary: buildSummary(release),
    explanation: row.explanation,
    sourceUrl: row.sourceUrl,
    release,
    releases,
    assets,
  };
}

/** Largest absolute measured move across an event's assets. Null when none. */
export function maxAbsMove(event: NewsEvent): number | null {
  let max: number | null = null;
  for (const asset of event.assets) {
    if (asset.percentChange === null) continue;
    const abs = Math.abs(asset.percentChange);
    if (max === null || abs > max) max = abs;
  }
  return max;
}
