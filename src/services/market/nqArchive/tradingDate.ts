/**
 * Map an instant to the CME Globex trading date used by the local NQ outright
 * archive.
 *
 * Every instant belongs to the first session in which it is observable: its
 * "session day" is the America/New_York date, advanced by one from 17:00 ET
 * onward (the daily break and the 18:00 ET evening open belong to the next
 * session). Weekend instants therefore land on Monday.
 *
 * The archive's own evidence is preferred. When the certification calendar
 * (certification-by-session.csv) covers the session day, the trading date is
 * the first certified session on or after it, so holidays absent from the
 * calendar are skipped — Sunday evening before MLK Monday → Tuesday.
 *
 * Without calendar coverage a weekday heuristic remains as a fail-closed
 * fallback: it still labels the date for inspection but refuses any session
 * adjacent to a US market holiday. Dates before the post-2012 Globex equity
 * schedule are refused on either basis.
 *
 * This helper does not invent a release time and does not certify the session.
 */
import { addIsoDays, isIsoDate, isoWeekday } from "./isoDate";
import { isUsMarketHoliday } from "./usHolidays";
import type { NqTradingCalendar, NqTradingDateResolution } from "./types";

/**
 * First trading date of the session schedule the grid models. Earlier
 * trade-date assignment needs the CME pause correction, which is not
 * implemented.
 */
export const SESSION_RULES_START_DATE = "2012-11-19";

/** Longest run of calendar days the certification calendar may skip. */
const MAX_CALENDAR_GAP_DAYS = 10;
const HOUR_MS = 3_600_000;
const WALL_CLOCK_CACHE_LIMIT = 50_000;

const newYorkParts = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

export interface NewYorkWallClock {
  readonly date: string;
  readonly hour: number;
  /** 0 = Sunday … 6 = Saturday. */
  readonly weekday: number;
}

// US Eastern offsets are whole hours and change on UTC hour boundaries, so
// every minute in one UTC hour shares a New York date and hour.
const wallClockByUtcHour = new Map<number, NewYorkWallClock>();

export function newYorkWallClock(instant: Date): NewYorkWallClock {
  const ms = instant.getTime();
  if (!Number.isFinite(ms)) {
    throw new TypeError("instant must be a finite Date");
  }
  const hourKey = Math.floor(ms / HOUR_MS);
  const cached = wallClockByUtcHour.get(hourKey);
  if (cached) return cached;

  const parts = newYorkParts.formatToParts(new Date(hourKey * HOUR_MS));
  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  const date = `${read("year")}-${read("month")}-${read("day")}`;
  const clock: NewYorkWallClock = {
    date,
    hour: Number(read("hour")) % 24,
    weekday: isoWeekday(date),
  };
  if (wallClockByUtcHour.size >= WALL_CLOCK_CACHE_LIMIT) wallClockByUtcHour.clear();
  wallClockByUtcHour.set(hourKey, clock);
  return clock;
}

export function createTradingCalendar(
  dates: Iterable<string>,
): NqTradingCalendar | null {
  const set = new Set([...dates].filter(isIsoDate));
  if (set.size === 0) return null;
  const sorted = [...set].sort();
  return {
    firstDate: sorted[0]!,
    lastDate: sorted[sorted.length - 1]!,
    isTradingDate: (date) => set.has(date),
  };
}

const sessionDayOf = (instant: Date): string => {
  const clock = newYorkWallClock(instant);
  return clock.hour >= 17 ? addIsoDays(clock.date, 1) : clock.date;
};

const previousWeekday = (date: string): string => {
  let day = addIsoDays(date, -1);
  while (isoWeekday(day) === 0 || isoWeekday(day) === 6) day = addIsoDays(day, -1);
  return day;
};

const nextWeekday = (date: string): string => {
  let day = date;
  while (isoWeekday(day) === 0 || isoWeekday(day) === 6) day = addIsoDays(day, 1);
  return day;
};

const isHolidayAdjacent = (date: string): boolean =>
  isUsMarketHoliday(date) ||
  isUsMarketHoliday(previousWeekday(date)) ||
  isUsMarketHoliday(nextWeekday(addIsoDays(date, 1)));

const fromCalendar = (
  sessionDay: string,
  calendar: NqTradingCalendar,
): string | null => {
  if (sessionDay < calendar.firstDate) return null;
  let day = sessionDay;
  for (let step = 0; step <= MAX_CALENDAR_GAP_DAYS; step += 1) {
    if (day > calendar.lastDate) return null;
    if (calendar.isTradingDate(day)) return day;
    day = addIsoDays(day, 1);
  }
  return null;
};

function resolveSessionDay(
  sessionDay: string,
  calendar: NqTradingCalendar | null,
): NqTradingDateResolution {
  const certified = calendar ? fromCalendar(sessionDay, calendar) : null;
  if (certified !== null) {
    return {
      tradingDate: certified,
      basis: "certification_calendar",
      refusalReason:
        certified < SESSION_RULES_START_DATE
          ? "PRE_2012_TRADING_DATE_UNSUPPORTED"
          : null,
    };
  }

  const tradingDate = nextWeekday(sessionDay);
  let refusalReason: string | null = null;
  if (tradingDate < SESSION_RULES_START_DATE) {
    refusalReason = "PRE_2012_TRADING_DATE_UNSUPPORTED";
  } else if (isHolidayAdjacent(tradingDate)) {
    refusalReason = "HOLIDAY_ADJACENT_TRADING_DATE";
  }
  return { tradingDate, basis: "heuristic_fallback", refusalReason };
}

/** Trading date for an exact release instant. */
export function tradingDateForReleaseAt(
  releaseAt: Date,
  calendar: NqTradingCalendar | null = null,
): NqTradingDateResolution {
  if (!(releaseAt instanceof Date) || !Number.isFinite(releaseAt.getTime())) {
    throw new TypeError("releaseAt must be a finite Date");
  }
  return resolveSessionDay(sessionDayOf(releaseAt), calendar);
}

/** Memoised per-minute resolver for scanning a window or a whole session. */
export function createTradingDateResolver(
  calendar: NqTradingCalendar | null,
): (instant: Date) => NqTradingDateResolution {
  const bySessionDay = new Map<string, NqTradingDateResolution>();
  return (instant) => {
    const sessionDay = sessionDayOf(instant);
    const cached = bySessionDay.get(sessionDay);
    if (cached) return cached;
    const resolved = resolveSessionDay(sessionDay, calendar);
    bySessionDay.set(sessionDay, resolved);
    return resolved;
  };
}

/** Truncate an instant to its UTC minute open (seconds/ms cleared). */
export function utcMinuteOpen(instant: Date): Date {
  const ms = instant.getTime();
  if (!Number.isFinite(ms)) {
    throw new TypeError("instant must be a finite Date");
  }
  return new Date(Math.floor(ms / 60_000) * 60_000);
}

/** First UTC minute open at or after an instant. */
export function ceilUtcMinute(instant: Date): Date {
  const ms = instant.getTime();
  if (!Number.isFinite(ms)) {
    throw new TypeError("instant must be a finite Date");
  }
  return new Date(Math.ceil(ms / 60_000) * 60_000);
}

/** Contiguous UTC minute opens from `first` through `last` inclusive. */
export function contiguousUtcMinuteOpens(
  first: Date,
  last: Date,
): Date[] {
  const start = utcMinuteOpen(first).getTime();
  const end = utcMinuteOpen(last).getTime();
  if (end < start) return [];
  const out: Date[] = [];
  for (let t = start; t <= end; t += 60_000) {
    out.push(new Date(t));
  }
  return out;
}
