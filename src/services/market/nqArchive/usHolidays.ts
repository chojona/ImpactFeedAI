/**
 * Rule-based US market holidays (NYSE observance rules), used ONLY to make the
 * trading-date heuristic refuse holiday-adjacent sessions. It is not a CME
 * schedule: early closes and one-off closures (for example national days of
 * mourning) are not modelled, which is why it may only ever refuse, never
 * certify.
 */
import { addIsoDays, isoDate, isoWeekday } from "./isoDate";

const nthWeekday = (
  year: number,
  month: number,
  weekday: number,
  n: number,
): string => {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const day = 1 + ((weekday - firstWeekday + 7) % 7) + (n - 1) * 7;
  return isoDate(year, month, day);
};

const lastWeekday = (year: number, month: number, weekday: number): string => {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastDow = new Date(Date.UTC(year, month - 1, lastDay)).getUTCDay();
  return isoDate(year, month, lastDay - ((lastDow - weekday + 7) % 7));
};

/** Anonymous Gregorian algorithm (Meeus/Jones/Butcher). */
const easterSunday = (year: number): string => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return isoDate(year, month, day);
};

/** Saturday → Friday, Sunday → Monday. */
const observed = (date: string): string => {
  const weekday = isoWeekday(date);
  if (weekday === 6) return addIsoDays(date, -1);
  if (weekday === 0) return addIsoDays(date, 1);
  return date;
};

const holidaysByYear = new Map<number, ReadonlySet<string>>();

const holidaysFor = (year: number): ReadonlySet<string> => {
  const cached = holidaysByYear.get(year);
  if (cached) return cached;
  const dates = [
    nthWeekday(year, 1, 1, 3), // Martin Luther King Jr. Day
    nthWeekday(year, 2, 1, 3), // Washington's Birthday
    addIsoDays(easterSunday(year), -2), // Good Friday
    lastWeekday(year, 5, 1), // Memorial Day
    observed(isoDate(year, 7, 4)),
    nthWeekday(year, 9, 1, 1), // Labor Day
    nthWeekday(year, 11, 4, 4), // Thanksgiving
    observed(isoDate(year, 12, 25)),
  ];
  // NYSE does not move a Saturday New Year's Day back into the prior year.
  const newYear = isoDate(year, 1, 1);
  if (isoWeekday(newYear) !== 6) dates.push(observed(newYear));
  if (year >= 2022) dates.push(observed(isoDate(year, 6, 19))); // Juneteenth
  const set = new Set(dates);
  holidaysByYear.set(year, set);
  return set;
};

export function isUsMarketHoliday(date: string): boolean {
  return holidaysFor(Number(date.slice(0, 4))).has(date);
}
