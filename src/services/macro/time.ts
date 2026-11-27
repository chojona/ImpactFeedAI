/**
 * Wall-clock → UTC conversion for US market times.
 *
 * Why this exists: the bulk ingestion sources used to build timestamps by
 * string concatenation with a hardcoded offset —
 * `new Date(\`${iso}T08:30:00-05:00\`)`. That is only correct from November to
 * March. Every release between the second Sunday in March and the first Sunday
 * in November was stamped an hour late, because Eastern time is UTC−4 then, not
 * UTC−5.
 *
 * The error is not cosmetic. A trusted `releaseAt` is the anchor the price
 * pipeline measures reactions from, so a Fed decision announced at 14:00 EDT was
 * anchored on the 15:00 candle and the entire first hour of the reaction — the
 * part that matters most — was attributed to the wrong window.
 *
 * No dependency is needed: the IANA database ships with Node's ICU data, and
 * `Intl.DateTimeFormat` can be inverted to recover a zone's offset at a given
 * instant.
 */

const US_EASTERN = "America/New_York";

interface IsoDayParts {
  year: number;
  month: number;
  day: number;
}

/** Parse YYYY-MM-DD without accepting Date's overflow normalisation. */
function parseIsoDay(isoDay: string): IsoDayParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay);
  if (!match) return null;

  const parts: IsoDayParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  const normalized = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day),
  );
  if (
    normalized.getUTCFullYear() !== parts.year ||
    normalized.getUTCMonth() !== parts.month - 1 ||
    normalized.getUTCDate() !== parts.day
  ) {
    return null;
  }
  return parts;
}

/**
 * Strict date-only UTC representation for a source reference/publication day.
 * It intentionally performs no business-day adjustment and no timezone guess.
 */
export function utcDateOnly(isoDay: string): Date {
  const parts = parseIsoDay(isoDay);
  return parts
    ? new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
    : new Date(NaN);
}

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: US_EASTERN,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Encode the New York clock fields as UTC so they can be compared numerically. */
function easternFieldsAsUtc(instant: Date): number {
  const parts = partsFormatter.formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type);
    return part ? Number(part.value) : 0;
  };
  return Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    // Some ICU versions render midnight as hour 24 under hour12: false.
    read("hour") % 24,
    read("minute"),
    read("second"),
  );
}

/**
 * The UTC instant at which the US Eastern wall clock reads
 * `<isoDay> <hour>:<minute>`.
 *
 * Returns an invalid Date for invalid or nonexistent local times. A repeated
 * local time requires an explicit UTC offset in minutes (e.g. EDT is -240).
 */
export function easternWallClock(
  isoDay: string,
  hour: number,
  minute: number,
  utcOffsetMinutes?: number,
): Date {
  const day = utcDateOnly(isoDay);
  if (
    Number.isNaN(day.getTime()) ||
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23 ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute > 59
  ) {
    return new Date(NaN);
  }
  const naiveUtc = day.getTime() + hour * 60 * 60_000 + minute * 60_000;

  // Both offsets in effect on a transition day are found by sampling on
  // either side. Round-trip the candidate's full local date and time.
  const offsets = new Set([naiveUtc - 86_400_000, naiveUtc + 86_400_000].map(
    (ms) => easternFieldsAsUtc(new Date(ms)) - ms,
  ));
  const matches = [...offsets]
    .filter((offset) => utcOffsetMinutes === undefined || offset === utcOffsetMinutes * 60_000)
    .map((offset) => new Date(naiveUtc - offset))
    .filter((candidate) => easternFieldsAsUtc(candidate) === naiveUtc);
  return matches.length === 1 ? matches[0] : new Date(NaN);
}

/** Conventional 08:30 ET release time for US economic data. */
export const usDataReleaseTime = (isoDay: string): Date =>
  easternWallClock(isoDay, 8, 30);

/** Conventional 14:00 ET publication time for an FOMC statement. */
export const fomcStatementTime = (isoDay: string): Date =>
  easternWallClock(isoDay, 14, 0);
