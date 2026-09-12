/**
 * The canonical US-equity session calendar.
 *
 * Trading days come from the reference instrument's own daily series (SPY),
 * so the calendar cannot drift from the prices measured over it and holidays
 * need no external dataset: a date with no reference bar is not a session.
 *
 * Close times are resolved through `easternWallClock`, which is DST-correct
 * by construction. A hardcoded UTC offset is never used.
 *
 * The early-close table is isolated here and exposed only through this API,
 * so no caller can consult a raw date list or bypass the supported-range
 * check — see spec §4.4.
 *
 * Source: NYSE holiday and hours calendar,
 * https://www.nyse.com/markets/hours-calendars (retrieved 2026-09-12).
 */
import { easternWallClock } from "@/services/macro/time";

/** Inclusive bounds of the curated early-close table. Extend together. */
export const EARLY_CLOSE_RANGE_START = "2022-01-01";
export const EARLY_CLOSE_RANGE_END = "2026-12-31";

/**
 * 13:00 ET closes (day after Thanksgiving, Christmas/Independence Day eves
 * when they fall on a trading day). Extend together with
 * EARLY_CLOSE_RANGE_END — see spec §4.4 for the fail-closed rule that governs
 * dates outside this table.
 */
const EARLY_CLOSE_DAYS: ReadonlySet<string> = new Set([
  "2022-07-01", "2022-11-25", "2022-12-23",
  "2023-07-03", "2023-11-24",
  "2024-07-03", "2024-11-29", "2024-12-24",
  "2025-07-03", "2025-11-28", "2025-12-24",
  "2026-07-02", "2026-11-27", "2026-12-24",
]);

const REGULAR_CLOSE_HOUR = 16;
const EARLY_CLOSE_HOUR = 13;

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
