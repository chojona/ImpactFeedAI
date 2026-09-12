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
import { HEADLINE_MEASURE, type ReactionMeasure } from "@/services/events/reactionMeasures";
import {
  CURRENT_REACTION_CALCULATION_VERSION,
  reactionTimingEligibility,
} from "@/services/events/timing";
import type { PriceBasis } from "@/types/market";
import type {
  AssetReaction,
  ConsensusStatus,
  DataReleaseView,
  Direction,
  EventTimingStatus,
  EventTypeName,
  MeasuredMove,
  NewsEvent,
  SessionBasis,
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
  reactionMeasurements: {
    symbol: string;
    measure: ReactionMeasure;
    anchorKind: "PRE_RELEASE_INTRADAY_BAR" | "PRIOR_SESSION_CLOSE";
    anchorPrice: number;
    anchorBarAt: Date;
    anchorSessionDay: Date;
    endpointPrice: number;
    endpointBarAt: Date;
    endpointSessionDay: Date;
    releaseSessionDay: Date;
    pctChange: number;
    priceBasis: PriceBasis;
    sessionBasis: SessionBasis;
    calculationVersion: number;
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

/**
 * Groups current-version measurement rows by symbol, in first-seen order.
 * Any other calculation version is excluded here — never at read time inside
 * a component — so nothing downstream can accidentally read an archived row.
 */
function groupMeasurementsBySymbol(
  rows: readonly EventRow["reactionMeasurements"][number][],
): [string, EventRow["reactionMeasurements"][number][]][] {
  const bySymbol = new Map<string, EventRow["reactionMeasurements"][number][]>();
  for (const row of rows) {
    if (row.calculationVersion !== CURRENT_REACTION_CALCULATION_VERSION) continue;
    const list = bySymbol.get(row.symbol) ?? [];
    list.push(row);
    bySymbol.set(row.symbol, list);
  }
  return [...bySymbol.entries()];
}

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

function toMeasuredMove(
  row: EventRow["reactionMeasurements"][number],
): MeasuredMove {
  return {
    measure: row.measure,
    pctChange: row.pctChange,
    anchorPrice: row.anchorPrice,
    anchorBarAt: isoInstant(row.anchorBarAt) as string,
    anchorSessionDay: isoDay(row.anchorSessionDay) as string,
    endpointPrice: row.endpointPrice,
    endpointBarAt: isoInstant(row.endpointBarAt) as string,
    endpointSessionDay: isoDay(row.endpointSessionDay) as string,
    releaseSessionDay: isoDay(row.releaseSessionDay) as string,
    anchorKind: row.anchorKind,
    priceBasis: row.priceBasis,
  };
}

/**
 * One symbol's measurements, already filtered to the current calculation
 * version. `rows` is never empty — callers only invoke this for a symbol that
 * grouped at least one row.
 */
/** A stored row this defensive to publish: never surfaces a non-finite value. */
function isUsableRow(row: EventRow["reactionMeasurements"][number]): boolean {
  return (
    Number.isFinite(row.anchorPrice) &&
    Number.isFinite(row.endpointPrice) &&
    Number.isFinite(row.pctChange)
  );
}

function mapAssetReaction(
  symbol: string,
  rows: readonly EventRow["reactionMeasurements"][number][],
): AssetReaction {
  const meta = assetMeta(symbol);
  const measures: Partial<Record<ReactionMeasure, MeasuredMove>> = {};
  for (const row of rows) {
    if (!isUsableRow(row)) continue;
    measures[row.measure] = toMeasuredMove(row);
  }
  const headline = measures[HEADLINE_MEASURE] ?? null;
  return {
    symbol,
    name: meta.name,
    assetType: meta.assetType,
    sessionBasis: rows[0].sessionBasis,
    measures,
    headlineMeasure: headline === null ? null : HEADLINE_MEASURE,
    percentChange: headline === null ? null : headline.pctChange,
    direction: directionOf(headline === null ? null : headline.pctChange),
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
    ? groupMeasurementsBySymbol(row.reactionMeasurements)
        .map(([symbol, rows]) => mapAssetReaction(symbol, rows))
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
