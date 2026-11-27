/**
 * Pure planning helpers for durable historical candle preservation.
 *
 * Given timing-eligible events, provider lookback limits, a session calendar,
 * and the openTimes the store already holds, this module ranks windows
 * approaching irreversible loss and produces an incremental, idempotent plan
 * of work units. Nothing here fetches from a market-data provider or writes to
 * Postgres — coverage and the calendar are injected so unit tests need no
 * network.
 *
 * Skip-when-covered is grid-based, not count-based: a window is fully covered
 * only when every expected regular-session openTime for the release window is
 * present. Equal bar counts with missing critical timestamps do not skip.
 */
import {
  INTERVAL_LOOKBACK_DAYS,
  INTERVAL_MINUTES,
  barsPerSession,
  estimateCandleRows,
  intervalReachableAt,
} from "./candle-semantics";
import { easternWallClock } from "@/services/macro/time";
import {
  assertSessionCalendarComplete,
  type SessionCalendar,
} from "@/services/market/sessionCalendar";
import type { CandleInterval } from "@/types/market";

const DAY_MS = 86_400_000;

/** US regular-session open, in minutes past midnight America/New_York. */
const REGULAR_OPEN_MINUTE = 9 * 60 + 30;

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
  /** Stored bar openTimes inside the event window (identity, not a count). */
  storedOpenTimes: readonly Date[];
}

export interface CoverageAssessment {
  /** Expected regular-session openTimes that fall inside the window. */
  expectedOpenTimes: readonly Date[];
  /** Expected openTimes absent from the store. */
  missingOpenTimes: readonly Date[];
  storedCount: number;
  /** True only when the expected grid is non-empty and fully present. */
  fullyCovered: boolean;
  /**
   * Why the grid could not be verified. A non-null reason always means
   * not fully covered (fail closed).
   */
  unverifiableReason: string | null;
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
  /** Size of the expected regular-session grid (0 when unverifiable). */
  minExpectedBars: number;
  missingCriticalCount: number;
  unverifiableReason: string | null;
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
  /** Reference session calendar (holidays absent; early closes via table). */
  calendar: SessionCalendar;
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
 * Upper-bound regular-session bar count for estimates only. Never used as
 * proof that a window is fully covered — see {@link assessWindowCoverage}.
 */
export function minExpectedBarsForWindow(
  interval: CandleInterval,
  daysEachSide: number = PRESERVATION_WINDOW_DAYS_EACH_SIDE,
): number {
  return (
    barsPerSession(interval, false) * sessionsInPreservationWindow(daysEachSide)
  );
}

export type ExpectedGridResult =
  | { status: "ok"; openTimes: Date[] }
  | { status: "refused"; reason: string };

/**
 * Regular-session openTimes for one session day at `interval`.
 *
 * Bars open at 09:30 ET and step by {@link INTERVAL_MINUTES} while the open is
 * strictly before the session close (16:00 ET, or 13:00 ET on a listed early
 * close). Daily expects the session-open stamp (09:30 ET), matching Yahoo's
 * US-equity daily convention.
 *
 * Fail closed when the curated early-close table does not cover `day`: a
 * guessed 16:00 close would under-expect bars on a half-day and could skip a
 * window that is still missing critical stamps.
 */
export function expectedRegularOpenTimesForSession(
  day: string,
  interval: CandleInterval,
  calendar: SessionCalendar,
): ExpectedGridResult {
  if (calendar.indexOf(day) === null) {
    return { status: "refused", reason: `day ${day} is not a session on the calendar` };
  }
  if (!calendar.earlyCloseKnown(day)) {
    return { status: "refused", reason: "early_close_unknown" };
  }

  if (interval === "ONE_DAY") {
    return {
      status: "ok",
      openTimes: [easternWallClock(day, 9, 30)],
    };
  }

  const closeMinute = calendar.isEarlyClose(day) ? 13 * 60 : 16 * 60;
  const step = INTERVAL_MINUTES[interval];
  const openTimes: Date[] = [];
  for (let minute = REGULAR_OPEN_MINUTE; minute < closeMinute; minute += step) {
    openTimes.push(
      easternWallClock(day, Math.floor(minute / 60), minute % 60),
    );
  }
  return { status: "ok", openTimes };
}

/**
 * Critical regular-session openTimes for the preservation window.
 *
 * First proves the observed calendar is complete against the independent
 * NYSE schedule for `[from, to]` — a missing trading day refuses rather than
 * shrinking the grid. Then emits opens for each overlapping session, keeping
 * only those inside the inclusive window. Weekends / full closes contribute
 * no stamps; early closes shorten that day's grid.
 */
export function expectedCriticalOpenTimes(args: {
  calendar: SessionCalendar;
  interval: CandleInterval;
  from: Date;
  to: Date;
}): ExpectedGridResult {
  const { calendar, interval, from, to } = args;
  const fromMs = from.getTime();
  const toMs = to.getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) {
    return { status: "refused", reason: "invalid_window_bounds" };
  }

  const completeness = assertSessionCalendarComplete(calendar, from, to);
  if (completeness.status === "refused") {
    return { status: "refused", reason: completeness.reason };
  }

  const openTimes: Date[] = [];

  for (const day of completeness.expectedDays) {
    const sessionOpen = easternWallClock(day, 9, 30);
    if (!Number.isFinite(sessionOpen.getTime())) {
      return { status: "refused", reason: `invalid_session_day:${day}` };
    }

    // Without early-close knowledge we cannot know the session's end, so any
    // day that could overlap the window refuses rather than guessing.
    if (!calendar.earlyCloseKnown(day)) {
      const regularClose = easternWallClock(day, 16, 0);
      if (
        sessionOpen.getTime() <= toMs &&
        regularClose.getTime() >= fromMs
      ) {
        return { status: "refused", reason: "early_close_unknown" };
      }
      continue;
    }

    const sessionClose = calendar.closeInstant(day, { honourEarlyClose: true });
    if (sessionOpen.getTime() > toMs || sessionClose.getTime() < fromMs) {
      continue;
    }

    const dayGrid = expectedRegularOpenTimesForSession(day, interval, calendar);
    if (dayGrid.status === "refused") return dayGrid;

    for (const openTime of dayGrid.openTimes) {
      const t = openTime.getTime();
      if (t >= fromMs && t <= toMs) openTimes.push(openTime);
    }
  }

  return { status: "ok", openTimes };
}

function openTimeKey(date: Date): number {
  return date.getTime();
}

/**
 * Compare stored openTimes against the expected regular-session grid.
 *
 * Count equality is irrelevant: a store with the right number of bars but the
 * wrong timestamps is not covered. An empty or unverifiable expected grid
 * never counts as covered (fail closed).
 */
export function assessWindowCoverage(args: {
  calendar: SessionCalendar;
  interval: CandleInterval;
  from: Date;
  to: Date;
  storedOpenTimes: readonly Date[];
}): CoverageAssessment {
  const storedCount = args.storedOpenTimes.length;
  const grid = expectedCriticalOpenTimes({
    calendar: args.calendar,
    interval: args.interval,
    from: args.from,
    to: args.to,
  });

  if (grid.status === "refused") {
    return {
      expectedOpenTimes: [],
      missingOpenTimes: [],
      storedCount,
      fullyCovered: false,
      unverifiableReason: grid.reason,
    };
  }

  if (grid.openTimes.length === 0) {
    return {
      expectedOpenTimes: [],
      missingOpenTimes: [],
      storedCount,
      fullyCovered: false,
      unverifiableReason: "empty_expected_grid",
    };
  }

  const stored = new Set(args.storedOpenTimes.map(openTimeKey));
  const missingOpenTimes = grid.openTimes.filter(
    (openTime) => !stored.has(openTimeKey(openTime)),
  );

  return {
    expectedOpenTimes: grid.openTimes,
    missingOpenTimes,
    storedCount,
    fullyCovered: missingOpenTimes.length === 0,
    unverifiableReason: null,
  };
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
 * and calendar yields the same remaining work units (idempotent planning).
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
      const assessment = assessWindowCoverage({
        calendar: input.calendar,
        interval: input.interval,
        from: window.from,
        to: window.to,
        storedOpenTimes: coverage.storedOpenTimes,
      });
      const skippedFullyCovered = assessment.fullyCovered;

      units.push({
        eventId: window.eventId,
        symbol,
        interval: input.interval,
        from: window.from,
        to: window.to,
        releaseAt: window.releaseAt,
        daysRemaining: window.daysRemaining,
        approachingLoss: window.approachingLoss,
        storedCount: assessment.storedCount,
        minExpectedBars: assessment.expectedOpenTimes.length,
        missingCriticalCount: assessment.missingOpenTimes.length,
        unverifiableReason: assessment.unverifiableReason,
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
