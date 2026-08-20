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

const REACTION_ELIGIBLE_STATUSES: ReadonlySet<EventTimingStatus> = new Set([
  "VERIFIED",
  "SCHEDULED",
]);

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
