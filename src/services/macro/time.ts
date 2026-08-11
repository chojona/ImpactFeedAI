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

/** Offset of US Eastern from UTC, in ms, at a specific instant. */
function easternOffsetMsAt(instant: Date): number {
  const parts = partsFormatter.formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type);
    return part ? Number(part.value) : 0;
  };
  const asIfUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    // Some ICU versions render midnight as hour 24 under hour12: false.
    read("hour") % 24,
    read("minute"),
    read("second"),
  );
  return asIfUtc - instant.getTime();
}

/**
 * The UTC instant at which the US Eastern wall clock reads
 * `<isoDay> <hour>:<minute>`.
 *
 * Two passes: the offset is first sampled at the naive instant, then re-sampled
 * at the corrected one. Near a DST transition those differ, and the second
 * sample is the one that belongs to the instant actually being returned.
 *
 * Returns an invalid Date for an unparseable `isoDay`, matching `new Date()`
 * semantics so callers keep their existing `Number.isNaN(t.getTime())` guards.
 */
export function easternWallClock(
  isoDay: string,
  hour: number,
  minute: number,
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

  const firstPass = naiveUtc - easternOffsetMsAt(new Date(naiveUtc));
  const secondPass = naiveUtc - easternOffsetMsAt(new Date(firstPass));
  return new Date(secondPass);
}

/** Conventional 08:30 ET release time for US economic data. */
export const usDataReleaseTime = (isoDay: string): Date =>
  easternWallClock(isoDay, 8, 30);

/** Conventional 14:00 ET publication time for an FOMC statement. */
export const fomcStatementTime = (isoDay: string): Date =>
  easternWallClock(isoDay, 14, 0);
