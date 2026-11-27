/**
 * Expected-minute model for CME Globex equity futures (post-2012 schedule):
 * Sunday 18:00 ET → Friday 17:00 ET with a daily 17:00–18:00 ET maintenance
 * break. Holiday early closes are not modelled here; sessions whose certified
 * `expected_active_minutes` disagrees with this model are refused upstream,
 * and archive bars inside modelled-closed minutes are reported, so a wrong
 * model can only ever refuse — never impute.
 */
import { createTradingDateResolver, newYorkWallClock } from "./tradingDate";
import type { NqTradingCalendar } from "./types";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
/** How far before its date a session may start (calendar gaps fold forward). */
const SESSION_LOOKBACK_DAYS = 12;

export function isGlobexActiveMinute(openAt: Date): boolean {
  const { hour, weekday } = newYorkWallClock(openAt);
  if (weekday === 6) return false;
  if (weekday === 0) return hour >= 18;
  if (weekday === 5) return hour < 17;
  return hour !== 17;
}

/** Modelled active minutes assigned to one trading date. */
export function sessionMinuteCount(
  tradingDate: string,
  calendar: NqTradingCalendar | null,
): number {
  const resolve = createTradingDateResolver(calendar);
  const end = Date.parse(`${tradingDate}T00:00:00.000Z`) + DAY_MS;
  const start = end - SESSION_LOOKBACK_DAYS * DAY_MS;
  let count = 0;
  for (let t = start; t < end; t += MINUTE_MS) {
    const openAt = new Date(t);
    if (isGlobexActiveMinute(openAt) && resolve(openAt).tradingDate === tradingDate) {
      count += 1;
    }
  }
  return count;
}
