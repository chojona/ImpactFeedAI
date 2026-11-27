/**
 * Pure planning helpers for durable historical candle preservation.
 *
 * Given timing-eligible events, provider lookback limits, and what the store
 * already holds, this module ranks windows approaching irreversible loss and
 * produces an incremental, idempotent plan of work units. Nothing here fetches
 * from a market-data provider or writes to Postgres — coverage is injected so
 * unit tests need no network.
 */
import {
  INTERVAL_LOOKBACK_DAYS,
  barsPerSession,
  estimateCandleRows,
  intervalReachableAt,
} from "./candle-semantics";
import type { CandleInterval } from "@/types/market";

const DAY_MS = 86_400_000;

/**
 * Calendar days fetched either side of the release instant. Matches
 * `backfill-candles.ts` so plan windows and execute windows stay aligned.
 */
export const PRESERVATION_WINDOW_DAYS_EACH_SIDE = 2;

export interface TimingEligibleEvent {
  id: string;
  releaseAt: Date;
  headline?: string;
  eventType?: string;
}

export interface EventWindow {
  eventId: string;
  releaseAt: Date;
  from: Date;
  to: Date;
  interval: CandleInterval;
  /** Whole days remaining before the lookback cliff (null = no cliff). */
  daysRemaining: number | null;
  /** True when the release instant is still inside the provider window. */
  reachable: boolean;
  /** True when daysRemaining is at or below the urgency threshold. */
  approachingLoss: boolean;
}

export interface CoverageSlice {
  symbol: string;
  interval: CandleInterval;
  /** Bars already stored whose openTime falls inside the event window. */
  storedCount: number;
}

export interface PreservationWorkUnit {
  eventId: string;
  symbol: string;
  interval: CandleInterval;
  from: Date;
  to: Date;
  releaseAt: Date;
  daysRemaining: number | null;
  approachingLoss: boolean;
  storedCount: number;
  /** Regular-session lower bound used to decide "fully covered". */
  minExpectedBars: number;
  /** Upper-bound rows this unit might still insert. */
  estimatedRowsUpperBound: number;
  skippedFullyCovered: boolean;
}

export interface PreservationPlan {
  interval: CandleInterval;
  symbols: string[];
  now: Date;
  windows: EventWindow[];
  units: PreservationWorkUnit[];
  /** Units that still need provider work. */
  remaining: PreservationWorkUnit[];
  skippedFullyCovered: number;
  estimatedRowsUpperBound: number;
}

export type CoverageLookup = (unit: {
  eventId: string;
  symbol: string;
  interval: CandleInterval;
  from: Date;
  to: Date;
}) => CoverageSlice;

export interface BuildPreservationPlanInput {
  events: TimingEligibleEvent[];
  symbols: string[];
  interval: CandleInterval;
  now?: Date;
  /**
   * Days-remaining at or below this value are flagged approaching loss.
   * Default 30 — roughly one month of runway before the cliff.
   */
  approachingLossDays?: number;
  coverageFor: CoverageLookup;
  /** Cap how many reachable events enter the plan (oldest-at-risk first). */
  limit?: number | null;
}

/** Inclusive event window centred on the release instant. */
export function eventWindowBounds(
  releaseAt: Date,
  daysEachSide: number = PRESERVATION_WINDOW_DAYS_EACH_SIDE,
): { from: Date; to: Date } {
  return {
    from: new Date(releaseAt.getTime() - daysEachSide * DAY_MS),
    to: new Date(releaseAt.getTime() + daysEachSide * DAY_MS),
  };
}

/**
 * Days remaining before `releaseAt` ages past the interval's lookback.
 * Null when the interval has no practical cliff (daily). Negative when
 * already past the cliff.
 */
export function daysRemainingUntilLookbackCliff(
  interval: CandleInterval,
  releaseAt: Date,
  now: Date = new Date(),
): number | null {
  const limitDays = INTERVAL_LOOKBACK_DAYS[interval];
  if (limitDays === null) return null;
  const ageDays = (now.getTime() - releaseAt.getTime()) / DAY_MS;
  return limitDays - ageDays;
}

/** Sessions spanned by ±N calendar days around the release (inclusive). */
export function sessionsInPreservationWindow(
  daysEachSide: number = PRESERVATION_WINDOW_DAYS_EACH_SIDE,
): number {
  return 2 * daysEachSide + 1;
}

/**
 * Lower-bound bar count that means "this window is already covered enough to
 * skip". Uses regular session only so a store that withheld extended bars is
 * not forced to re-fetch forever.
 */
export function minExpectedBarsForWindow(
  interval: CandleInterval,
  daysEachSide: number = PRESERVATION_WINDOW_DAYS_EACH_SIDE,
): number {
  return (
    barsPerSession(interval, false) * sessionsInPreservationWindow(daysEachSide)
  );
}

export function isWindowFullyCovered(
  storedCount: number,
  interval: CandleInterval,
  daysEachSide: number = PRESERVATION_WINDOW_DAYS_EACH_SIDE,
): boolean {
  return storedCount >= minExpectedBarsForWindow(interval, daysEachSide);
}

/**
 * Rank reachable windows oldest-at-risk first: smallest daysRemaining, then
 * earliest releaseAt, then event id.
 */
export function rankWindowsApproachingLoss(
  windows: EventWindow[],
): EventWindow[] {
  return windows
    .filter((window) => window.reachable)
    .slice()
    .sort((a, b) => {
      const aDays = a.daysRemaining ?? Number.POSITIVE_INFINITY;
      const bDays = b.daysRemaining ?? Number.POSITIVE_INFINITY;
      if (aDays !== bDays) return aDays - bDays;
      const byRelease = a.releaseAt.getTime() - b.releaseAt.getTime();
      if (byRelease !== 0) return byRelease;
      return a.eventId.localeCompare(b.eventId);
    });
}

/** Build the per-event window inventory for one interval. */
export function buildEventWindows(
  events: TimingEligibleEvent[],
  interval: CandleInterval,
  now: Date,
  approachingLossDays: number,
): EventWindow[] {
  return events.map((event) => {
    const { from, to } = eventWindowBounds(event.releaseAt);
    const daysRemaining = daysRemainingUntilLookbackCliff(
      interval,
      event.releaseAt,
      now,
    );
    const reachable = intervalReachableAt(interval, event.releaseAt, now);
    const approachingLoss =
      reachable &&
      daysRemaining !== null &&
      daysRemaining <= approachingLossDays;

    return {
      eventId: event.id,
      releaseAt: event.releaseAt,
      from,
      to,
      interval,
      daysRemaining,
      reachable,
      approachingLoss,
    };
  });
}

/**
 * Coverage key for Map-backed lookups used by tests and by CLI batching.
 * openTime bounds are ISO strings so the key is stable across Date instances.
 */
export function coverageKey(
  symbol: string,
  interval: CandleInterval,
  from: Date,
  to: Date,
): string {
  return `${symbol}|${interval}|${from.toISOString()}|${to.toISOString()}`;
}

/**
 * Produce an incremental preservation plan. Re-running with the same coverage
 * yields the same remaining work units (idempotent planning).
 */
export function buildPreservationPlan(
  input: BuildPreservationPlanInput,
): PreservationPlan {
  const now = input.now ?? new Date();
  const approachingLossDays = input.approachingLossDays ?? 30;
  const symbols = [...new Set(input.symbols.map((s) => s.toUpperCase()))];
  const windows = buildEventWindows(
    input.events,
    input.interval,
    now,
    approachingLossDays,
  );

  const ranked = rankWindowsApproachingLoss(windows);
  const selected =
    input.limit === null || input.limit === undefined
      ? ranked
      : ranked.slice(0, input.limit);

  const minExpected = minExpectedBarsForWindow(input.interval);
  const sessions = sessionsInPreservationWindow();
  const units: PreservationWorkUnit[] = [];

  for (const window of selected) {
    for (const symbol of symbols) {
      const coverage = input.coverageFor({
        eventId: window.eventId,
        symbol,
        interval: input.interval,
        from: window.from,
        to: window.to,
      });
      const skippedFullyCovered = isWindowFullyCovered(
        coverage.storedCount,
        input.interval,
      );

      units.push({
        eventId: window.eventId,
        symbol,
        interval: input.interval,
        from: window.from,
        to: window.to,
        releaseAt: window.releaseAt,
        daysRemaining: window.daysRemaining,
        approachingLoss: window.approachingLoss,
        storedCount: coverage.storedCount,
        minExpectedBars: minExpected,
        estimatedRowsUpperBound: skippedFullyCovered
          ? 0
          : estimateCandleRows({
              interval: input.interval,
              sessionsPerEvent: sessions,
              events: 1,
              symbols: 1,
              includeExtended: true,
            }),
        skippedFullyCovered,
      });
    }
  }

  const remaining = units.filter((unit) => !unit.skippedFullyCovered);

  return {
    interval: input.interval,
    symbols,
    now,
    windows,
    units,
    remaining,
    skippedFullyCovered: units.length - remaining.length,
    estimatedRowsUpperBound: remaining.reduce(
      (sum, unit) => sum + unit.estimatedRowsUpperBound,
      0,
    ),
  };
}
