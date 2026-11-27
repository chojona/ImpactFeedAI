/**
 * The canonical US-equity session calendar.
 *
 * Trading days usually come from the reference instrument's own daily series
 * (SPY). That evidence alone is not proof of completeness: a missing SPY bar
 * would shrink the session list and let coverage checks under-expect. Full
 * closes are therefore also curated from official NYSE/ICE holiday schedules
 * for the supported range, so callers can fail closed when observed days omit
 * an authoritative session.
 *
 * Close times are resolved through `easternWallClock`, which is DST-correct
 * by construction. A hardcoded UTC offset is never used.
 *
 * The early-close and full-close tables are isolated here and exposed only
 * through this API, so no caller can consult a raw date list or bypass the
 * supported-range check — see spec §4.4.
 *
 * Sources: official NYSE/ICE 2022–2024, 2025–2027 and 2026–2028
 * announcements, rechecked 2026-11-05. Exact citations and independently
 * transcribed fixtures: tests/fixtures/nyse-hours.json. Calendar revision 5.
 * The three false half-days removed here MUST NOT be written as v3.
 */
import { easternWallClock } from "@/services/macro/time";

/** Inclusive bounds of the curated early-close / full-close tables. Extend together. */
export const EARLY_CLOSE_RANGE_START = "2022-01-01";
export const EARLY_CLOSE_RANGE_END = "2026-12-31";
export const NYSE_SCHEDULE_RANGE_START = EARLY_CLOSE_RANGE_START;
export const NYSE_SCHEDULE_RANGE_END = EARLY_CLOSE_RANGE_END;

/**
 * Source-listed 13:00 ET closes. Do not infer half-days from holiday eves
 * or observed holidays. Extend together with
 * EARLY_CLOSE_RANGE_END — see spec §4.4 for the fail-closed rule that governs
 * dates outside this table.
 */
const EARLY_CLOSE_DAYS: ReadonlySet<string> = new Set([
  "2022-11-25",
  "2023-07-03", "2023-11-24",
  "2024-07-03", "2024-11-29", "2024-12-24",
  "2025-07-03", "2025-11-28", "2025-12-24",
  "2026-11-27", "2026-12-24",
]);

/**
 * Official NYSE full-session closures (weekday holidays / observances).
 * Weekends are never sessions and are not listed. Early-close half-days are
 * sessions and belong in {@link EARLY_CLOSE_DAYS}, not here.
 *
 * Transcribed from the same NYSE/ICE announcements as the early-close table;
 * extend together with {@link NYSE_SCHEDULE_RANGE_END}.
 */
const NYSE_FULL_CLOSE_DAYS: ReadonlySet<string> = new Set([
  // 2022 — New Year's Day fell Saturday (observed 2021-12-31, outside range).
  "2022-01-17", // Martin Luther King, Jr. Day
  "2022-02-21", // Washington's Birthday
  "2022-04-15", // Good Friday
  "2022-05-30", // Memorial Day
  "2022-06-20", // Juneteenth National Independence Day (observed)
  "2022-07-04", // Independence Day
  "2022-09-05", // Labor Day
  "2022-11-24", // Thanksgiving Day
  "2022-12-26", // Christmas Day (observed)

  // 2023
  "2023-01-02", // New Year's Day (observed)
  "2023-01-16",
  "2023-02-20",
  "2023-04-07",
  "2023-05-29",
  "2023-06-19",
  "2023-07-04",
  "2023-09-04",
  "2023-11-23",
  "2023-12-25",

  // 2024
  "2024-01-01",
  "2024-01-15",
  "2024-02-19",
  "2024-03-29",
  "2024-05-27",
  "2024-06-19",
  "2024-07-04",
  "2024-09-02",
  "2024-11-28",
  "2024-12-25",

  // 2025
  "2025-01-01",
  "2025-01-20",
  "2025-02-17",
  "2025-04-18",
  "2025-05-26",
  "2025-06-19",
  "2025-07-04",
  "2025-09-01",
  "2025-11-27",
  "2025-12-25",

  // 2026 — Independence Day falls Saturday; Friday 2026-07-03 is the full close.
  "2026-01-01",
  "2026-01-19",
  "2026-02-16",
  "2026-04-03",
  "2026-05-25",
  "2026-06-19",
  "2026-07-03",
  "2026-09-07",
  "2026-11-26",
  "2026-12-25",
]);

const REGULAR_CLOSE_HOUR = 16;
const EARLY_CLOSE_HOUR = 13;

const newYorkDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** YYYY-MM-DD in America/New_York. */
export function newYorkDateString(date: Date): string {
  return newYorkDateFormatter.format(date);
}

function addUtcDays(isoDay: string, delta: number): string {
  const [year, month, day] = isoDay.split("-").map(Number);
  const next = new Date(Date.UTC(year!, month! - 1, day! + delta));
  return next.toISOString().slice(0, 10);
}

function weekdayUtc(isoDay: string): number {
  // Date.UTC noon avoids DST edge cases when reading getUTCDay.
  const [year, month, day] = isoDay.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!, 12)).getUTCDay();
}

/** Whether `day` is inside the curated official NYSE schedule range. */
export function nyseScheduleKnown(day: string): boolean {
  return day >= NYSE_SCHEDULE_RANGE_START && day <= NYSE_SCHEDULE_RANGE_END;
}

/** Official full-session closure (not a weekend, not an early close). */
export function isNyseFullClose(day: string): boolean {
  return NYSE_FULL_CLOSE_DAYS.has(day);
}

export type AuthoritativeScheduleResult =
  | { status: "ok"; days: string[] }
  | { status: "refused"; reason: string };

/**
 * Authoritative NYSE session days whose regular session overlaps `[from, to]`:
 * weekdays minus curated full closes, filtered by 09:30–close ET overlap.
 *
 * Fail closed outside {@link NYSE_SCHEDULE_RANGE_START}–
 * {@link NYSE_SCHEDULE_RANGE_END}. This schedule is independent of any
 * stored SPY series, so a missing reference bar cannot erase a session.
 */
export function authoritativeSessionDaysOverlapping(
  from: Date,
  to: Date,
): AuthoritativeScheduleResult {
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) {
    return { status: "refused", reason: "invalid_window_bounds" };
  }
  if (to.getTime() < from.getTime()) {
    return { status: "refused", reason: "invalid_window_bounds" };
  }

  const fromMs = from.getTime();
  const toMs = to.getTime();
  // Pad one Eastern calendar day either side so a session that straddles the
  // window bound is still considered.
  let day = addUtcDays(newYorkDateString(from), -1);
  const end = addUtcDays(newYorkDateString(to), 1);
  const days: string[] = [];

  while (day <= end) {
    if (!nyseScheduleKnown(day)) {
      return { status: "refused", reason: "nyse_schedule_unknown" };
    }
    const weekday = weekdayUtc(day);
    if (weekday !== 0 && weekday !== 6 && !NYSE_FULL_CLOSE_DAYS.has(day)) {
      const sessionOpen = easternWallClock(day, 9, 30);
      const sessionClose = easternWallClock(
        day,
        EARLY_CLOSE_DAYS.has(day) ? EARLY_CLOSE_HOUR : REGULAR_CLOSE_HOUR,
        0,
      );
      if (
        sessionOpen.getTime() <= toMs &&
        sessionClose.getTime() >= fromMs
      ) {
        days.push(day);
      }
    }
    if (day === end) break;
    day = addUtcDays(day, 1);
  }

  return { status: "ok", days };
}

export type CalendarCompletenessResult =
  | { status: "ok"; expectedDays: readonly string[] }
  | { status: "refused"; reason: string; missingDays: readonly string[] };

/**
 * Prove an observed session calendar covers every authoritative session day
 * that overlaps `[from, to]`. A missing day fails closed — never shrinks the
 * expected grid.
 */
export function assertSessionCalendarComplete(
  calendar: SessionCalendar,
  from: Date,
  to: Date,
): CalendarCompletenessResult {
  const expected = authoritativeSessionDaysOverlapping(from, to);
  if (expected.status === "refused") {
    return { status: "refused", reason: expected.reason, missingDays: [] };
  }

  const missingDays = expected.days.filter(
    (day) => calendar.indexOf(day) === null,
  );
  if (missingDays.length > 0) {
    return {
      status: "refused",
      reason: `incomplete_session_calendar:missing:${missingDays[0]}`,
      missingDays,
    };
  }

  return { status: "ok", expectedDays: expected.days };
}

export interface CloseOptions {
  /** When true, a listed early-close day resolves to 13:00 ET. */
  honourEarlyClose?: boolean;
}

export interface SessionCalendar {
  readonly sessionDays: readonly string[];
  /** Ordinal of a session day, or null when the date is not a session. */
  indexOf(day: string): number | null;
  /** Session day at an ordinal, or null when out of range. Never extrapolates. */
  dayAt(index: number): string | null;
  isEarlyClose(day: string): boolean;
  /** Whether `day` sits inside the curated early-close range. */
  earlyCloseKnown(day: string): boolean;
  closeInstant(day: string, options?: CloseOptions): Date;
}

/** Trading days on which the reference instrument has a provider daily bar. */
export function buildSessionCalendar(
  referenceDays: readonly string[],
): SessionCalendar {
  const sessionDays = [...new Set(referenceDays)].sort();
  const ordinals = new Map(sessionDays.map((day, index) => [day, index]));

  return {
    sessionDays,
    indexOf: (day) => ordinals.get(day) ?? null,
    dayAt: (index) =>
      index >= 0 && index < sessionDays.length ? sessionDays[index] : null,
    isEarlyClose: (day) => EARLY_CLOSE_DAYS.has(day),
    earlyCloseKnown: (day) =>
      day >= EARLY_CLOSE_RANGE_START && day <= EARLY_CLOSE_RANGE_END,
    closeInstant: (day, options) =>
      easternWallClock(
        day,
        options?.honourEarlyClose === true && EARLY_CLOSE_DAYS.has(day)
          ? EARLY_CLOSE_HOUR
          : REGULAR_CLOSE_HOUR,
        0,
      ),
  };
}

export type ReleaseSessionRefusal =
  | "no_session_after_release"
  | "early_close_unknown";

export type ReleaseSessionResolution =
  | { status: "resolved"; day: string; index: number }
  | { status: "refused"; reason: ReleaseSessionRefusal };

/**
 * The release session: the first canonical session whose CLOSE is strictly
 * after `releaseAt`.
 *
 * A release timestamped exactly at a close therefore belongs to the
 * FOLLOWING session — the closing instant belongs to the session that just
 * ended, not the one about to start.
 *
 * An early close can only change the answer for a release in [13:00, 16:00)
 * ET: before 13:00 neither close has passed, at or after 16:00 both have.
 * Inside that window, on a date the curated table does not cover, this
 * refuses rather than assuming a normal 16:00 close — see spec §4.4.
 */
export function resolveReleaseSession(
  calendar: SessionCalendar,
  releaseAt: Date,
): ReleaseSessionResolution {
  if (!Number.isFinite(releaseAt.getTime())) {
    return { status: "refused", reason: "no_session_after_release" };
  }

  for (let index = 0; index < calendar.sessionDays.length; index += 1) {
    const day = calendar.sessionDays[index];
    // Only this day's [13:00,16:00) can be ambiguous. An old, already
    // completed session outside the table must not poison a later release.
    const regularClose = calendar.closeInstant(day);
    if (regularClose.getTime() <= releaseAt.getTime()) continue;
    if (
      !calendar.earlyCloseKnown(day) &&
      easternWallClock(day, 13, 0).getTime() <= releaseAt.getTime()
    ) {
      return { status: "refused", reason: "early_close_unknown" };
    }
    const close = calendar.closeInstant(day, { honourEarlyClose: true });
    if (close.getTime() > releaseAt.getTime()) {
      return { status: "resolved", day, index };
    }
  }
  return { status: "refused", reason: "no_session_after_release" };
}
