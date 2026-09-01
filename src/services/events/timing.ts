import type {
  EventTimingStatus,
  ReactionTimingIneligibility,
} from "@/types/events";

export type { ReactionTimingIneligibility } from "@/types/events";

/**
 * Every persisted reaction is tied to the calculation semantics represented by
 * this version. Bumping it makes older rows opt out of reads until they have
 * been deliberately recomputed.
 */
export const CURRENT_REACTION_CALCULATION_VERSION = 2;

/**
 * The only timing statuses that can anchor a published reaction.
 *
 * Exported because the query layer has to prefilter on it in SQL. Keeping a
 * second literal list next to the Prisma `where` is how a database prefilter
 * and the application predicate drift apart — and drift in this direction is
 * silent, because a query that admits one status too many produces rows that
 * look exactly like eligible ones.
 */
export const REACTION_ELIGIBLE_TIMING_STATUSES = [
  "VERIFIED",
  "SCHEDULED",
] as const satisfies readonly EventTimingStatus[];

const REACTION_ELIGIBLE_STATUSES: ReadonlySet<EventTimingStatus> = new Set(
  REACTION_ELIGIBLE_TIMING_STATUSES,
);

export type ReactionTimingEligibility =
  | { eligible: true; reason: null }
  | { eligible: false; reason: ReactionTimingIneligibility };

export interface ReactionTimingInput {
  releaseAt: Date | null;
  timingStatus: EventTimingStatus;
  timingSource: string | null;
}

/**
 * A reaction is publishable only when both the instant and its provenance are
 * defensible. A plausible-looking Date alone is intentionally insufficient.
 */
export function reactionTimingEligibility(
  input: ReactionTimingInput,
): ReactionTimingEligibility {
  if (!REACTION_ELIGIBLE_STATUSES.has(input.timingStatus)) {
    return { eligible: false, reason: "untrusted_status" };
  }
  if (
    input.releaseAt === null ||
    !Number.isFinite(input.releaseAt.getTime())
  ) {
    return { eligible: false, reason: "missing_release_timestamp" };
  }
  if (input.timingSource === null || input.timingSource.trim().length === 0) {
    return { eligible: false, reason: "missing_timing_source" };
  }
  return { eligible: true, reason: null };
}

export const isReactionTimingEligible = (input: ReactionTimingInput): boolean =>
  reactionTimingEligibility(input).eligible;

export const timingStatusLabel = (status: EventTimingStatus): string => {
  switch (status) {
    case "VERIFIED":
      return "Verified release time";
    case "SCHEDULED":
      return "Official scheduled time";
    case "INFERRED":
      return "Inferred release time";
    case "DATE_ONLY":
      return "Release date only";
    case "REFERENCE_PERIOD_ONLY":
      return "Reference period only";
    case "UNVERIFIED":
      return "Unverified timing";
  }
};

export const timingStatusExplanation = (status: EventTimingStatus): string => {
  switch (status) {
    case "VERIFIED":
      return "The release instant is backed by a named timing source.";
    case "SCHEDULED":
      return "The release uses an official published schedule and named source.";
    case "INFERRED":
      return "The time was inferred rather than obtained from an official release record.";
    case "DATE_ONLY":
      return "The publication date is known, but no defensible release time is available.";
    case "REFERENCE_PERIOD_ONLY":
      return "Only the period measured by the statistic is known; its publication timing is not.";
    case "UNVERIFIED":
      return "The stored timing has not been verified against a named source.";
  }
};

export const reactionTimingIneligibilityExplanation = (
  reason: ReactionTimingIneligibility,
): string => {
  switch (reason) {
    case "untrusted_status":
      return "The stored release timing is not verified or from an official published schedule.";
    case "missing_release_timestamp":
      return "No valid exact release instant is recorded, so a defensible price window cannot be anchored.";
    case "missing_timing_source":
      return "The release instant has no named timing source, so its provenance cannot be verified.";
  }
};

/**
 * The timing story for one event, in one place.
 *
 * The detail page and the feed card were each deriving this independently and
 * had already drifted on the "verified status but incomplete provenance" case.
 * `tone` is deliberately binary — a reaction is either publishable or it is
 * not, and a third shade would invite treating "nearly trusted" as trusted.
 */
export interface TimingDisplay {
  label: string;
  explanation: string;
  tone: "trusted" | "caution";
}

export function timingDisplay(timing: {
  status: EventTimingStatus;
  reactionEligible: boolean;
  ineligibilityReason: ReactionTimingIneligibility | null;
}): TimingDisplay {
  const claimsExactTiming =
    timing.status === "VERIFIED" || timing.status === "SCHEDULED";

  const label =
    !timing.reactionEligible && claimsExactTiming
      ? "Timing provenance incomplete"
      : timingStatusLabel(timing.status);

  const explanation =
    timing.ineligibilityReason === null
      ? timingStatusExplanation(timing.status)
      : reactionTimingIneligibilityExplanation(timing.ineligibilityReason);

  return {
    label,
    explanation,
    tone: timing.reactionEligible ? "trusted" : "caution",
  };
}

/**
 * How precisely the record can place the event in time, most precise first.
 *
 * These are four different claims, not four renderings of one claim, and the
 * feed used to collapse the middle two into "No release date" — which told a
 * reader that nothing was known about *when* an event happened even when the
 * occurrence date was recorded. Naming the levels is what keeps a fallback from
 * quietly borrowing the precision of the level above it.
 *
 *   - `release_instant`      — a sourced publication instant
 *   - `release_date`         — the publication day, with no defensible time
 *   - `event_date`           — the recorded occurrence day; the release timing
 *                              is NOT verified, and is not claimed to be
 *   - `reference_period`     — only the period the statistic measures
 *   - `unknown`              — nothing placeable in time at all
 */
export type EventWhenPrecision =
  | "release_instant"
  | "release_date"
  | "event_date"
  | "reference_period"
  | "unknown";

export interface EventWhenDisplay {
  precision: EventWhenPrecision;
  /**
   * Compact rendering of the date, for the feed card. Never carries a component
   * the source does not support. A surface with more room — the event header —
   * may re-render `timing.releaseAt` at full instant precision itself, but only
   * for `release_instant`; every lower level has no time to render.
   */
  text: string;
  /**
   * `<time datetime>` value at exactly the precision claimed — an instant for a
   * sourced release, a calendar day for everything else. Null when there is no
   * date to machine-read. An occurrence day is never emitted as an instant:
   * that is the one place a fallback could silently re-acquire the precision it
   * just admitted it does not have.
   */
  dateTime: string | null;
  /** True when a calendar date is known, whatever its provenance. */
  dateKnown: boolean;
  /** Caption naming which of the levels above is being shown. */
  label: string;
  explanation: string;
  tone: "trusted" | "caution";
}

const EVENT_DATE_LABEL = "Event date · time unverified";

const EVENT_DATE_EXPLANATION =
  "The date this event is recorded as occurring is known, but no release time has been verified against a named source. The day shown is the stored occurrence date in US Eastern time, not a sourced release timestamp.";

const NO_DATE_EXPLANATION =
  "No release instant, publication date or occurrence date is recorded for this event.";

/** The narrow shape `NewsEvent` already satisfies structurally. */
export interface EventWhenInput {
  timing: {
    status: EventTimingStatus;
    releaseAt: string | null;
    releaseDate: string | null;
    reactionEligible: boolean;
    ineligibilityReason: ReactionTimingIneligibility | null;
  };
  /** The event's own occurrence instant, as mapped. */
  occurredAt: string;
  releases: readonly { referencePeriodStart: string | null }[];
}

/**
 * The most precise "when" a record supports, and no more.
 *
 * One derivation, shared by the feed card and the event header, because the two
 * surfaces answering "when did this happen" differently is exactly the drift
 * this module exists to prevent. `occurredAt` sits below both release fields
 * and above the reference period: it is a real date the row already carries, so
 * withholding it says less than the database knows — but it is reduced to a day
 * and labelled as an occurrence, because presenting it at instant precision
 * would launder unverified timing into a sourced release timestamp.
 */
export function eventWhenDisplay(event: EventWhenInput): EventWhenDisplay {
  const timing = timingDisplay(event.timing);

  const exact = formatNewYorkDate(event.timing.releaseAt);
  if (exact !== null) {
    return {
      precision: "release_instant",
      text: exact,
      dateTime: event.timing.releaseAt,
      dateKnown: true,
      label: timing.tone === "trusted" ? "Verified timing" : timing.label,
      explanation: timing.explanation,
      tone: timing.tone,
    };
  }

  const releaseDate = formatPlainDate(event.timing.releaseDate);
  if (releaseDate !== null) {
    return {
      precision: "release_date",
      text: releaseDate,
      dateTime: event.timing.releaseDate,
      dateKnown: true,
      label: timing.label,
      explanation: timing.explanation,
      tone: timing.tone,
    };
  }

  const occurredDay = formatNewYorkDate(event.occurredAt);
  if (occurredDay !== null) {
    return {
      precision: "event_date",
      text: occurredDay,
      // A day, not the stored instant. The instant is unverified; publishing it
      // in a machine-readable attribute would assert a precision the label in
      // the same breath denies.
      dateTime: newYorkIsoDay(event.occurredAt),
      dateKnown: true,
      label: EVENT_DATE_LABEL,
      explanation: EVENT_DATE_EXPLANATION,
      tone: "caution",
    };
  }

  // Below here the row carries no date at all. `occurredAt` is non-null in the
  // schema, so these two levels are reachable only from a malformed instant —
  // they are kept because "no date" must still render as a stated absence.
  const reference = event.releases
    .map((release) => formatReferencePeriod(release.referencePeriodStart))
    .find((value): value is string => value !== null);
  if (reference !== undefined) {
    return {
      precision: "reference_period",
      text: `Ref ${reference}`,
      dateTime: null,
      dateKnown: false,
      label: timing.label,
      explanation: timing.explanation,
      tone: "caution",
    };
  }

  return {
    precision: "unknown",
    text: "No date recorded",
    dateTime: null,
    dateKnown: false,
    label: timing.label,
    explanation: NO_DATE_EXPLANATION,
    tone: "caution",
  };
}

const newYorkDateTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "long",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

const newYorkDate = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const plainDate = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "long",
  day: "numeric",
  year: "numeric",
});

const referencePeriod = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  year: "numeric",
});

function instantFromIso(value: string | null): Date | null {
  if (value === null) return null;
  const instant = new Date(value);
  return Number.isFinite(instant.getTime()) ? instant : null;
}

function dateFromIsoDay(value: string | null): Date | null {
  if (value === null) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  // Noon UTC avoids a date shift in every North American time zone, but these
  // values are formatted in UTC anyway because a SQL DATE is not an instant.
  const date = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), 12),
  );
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return null;
  }
  return date;
}

/**
 * The calendar day an instant falls on in US Eastern time, as YYYY-MM-DD.
 *
 * `en-CA` is used purely because its short date format *is* ISO order; the
 * output is a date, never an instant, which is the point at the one call site
 * that needs it.
 */
const newYorkIsoDayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function newYorkIsoDay(value: string | null): string | null {
  const instant = instantFromIso(value);
  return instant === null ? null : newYorkIsoDayFormat.format(instant);
}

export function formatNewYorkDateTime(value: string | null): string | null {
  const instant = instantFromIso(value);
  return instant === null ? null : newYorkDateTime.format(instant);
}

export function formatNewYorkDate(value: string | null): string | null {
  const instant = instantFromIso(value);
  return instant === null ? null : newYorkDate.format(instant);
}

/** Format a SQL DATE without interpreting it as a release instant. */
export function formatPlainDate(value: string | null): string | null {
  const date = dateFromIsoDay(value);
  return date === null ? null : plainDate.format(date);
}

export function formatReferencePeriod(value: string | null): string | null {
  const date = dateFromIsoDay(value);
  return date === null ? null : referencePeriod.format(date);
}
