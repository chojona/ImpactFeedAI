/**
 * Map a verified release instant to the CME Globex trading date used by the
 * local NQ outright archive.
 *
 * For standard 08:30 ET macro releases this is the America/New_York calendar
 * date of the instant. Evening Globex hours (after the daily maintenance break)
 * belong to the *next* weekday trading date under post-2012 regimes; that case
 * is handled explicitly so weekend/Sunday opens do not silently mis-label.
 *
 * This helper does not invent a release time and does not certify the session.
 */

const newYorkParts = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});

const isoDate = (year: number, month: number, day: number): string =>
  `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const addCalendarDays = (year: number, month: number, day: number, delta: number): string => {
  const utc = new Date(Date.UTC(year, month - 1, day + delta));
  return isoDate(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
};

/**
 * Trading date YYYY-MM-DD for an exact release instant.
 *
 * Minutes past midnight America/New_York at or after 18:00 on Sun–Thu roll to
 * the next calendar day (Globex evening open). Friday after 17:00 / weekend
 * closures are not invented here — Friday 18:00+ is treated as the next
 * session's date only when it is Sunday evening or weekday evening open.
 */
export function tradingDateForReleaseAt(releaseAt: Date): string {
  if (!(releaseAt instanceof Date) || !Number.isFinite(releaseAt.getTime())) {
    throw new TypeError("releaseAt must be a finite Date");
  }

  const parts = newYorkParts.formatToParts(releaseAt);
  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";

  const year = Number(read("year"));
  const month = Number(read("month"));
  const day = Number(read("day"));
  const hour = Number(read("hour")) % 24;
  const weekday = read("weekday"); // Sun, Mon, ...
  const calendar = isoDate(year, month, day);

  // Post-2012 Globex evening session (18:00 ET) belongs to the next trade date.
  // Sunday evening open → Monday trading date; Mon–Thu evening → next day.
  if (hour >= 18) {
    if (weekday === "Sun") {
      return addCalendarDays(year, month, day, 1);
    }
    if (
      weekday === "Mon" ||
      weekday === "Tue" ||
      weekday === "Wed" ||
      weekday === "Thu"
    ) {
      return addCalendarDays(year, month, day, 1);
    }
  }

  return calendar;
}

/** Truncate an instant to its UTC minute open (seconds/ms cleared). */
export function utcMinuteOpen(instant: Date): Date {
  const ms = instant.getTime();
  if (!Number.isFinite(ms)) {
    throw new TypeError("instant must be a finite Date");
  }
  return new Date(Math.floor(ms / 60_000) * 60_000);
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
