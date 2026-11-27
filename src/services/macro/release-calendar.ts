/**
 * Source-agnostic contract for resolving historical macro release timing.
 *
 * Providers return only timing facts they can support with provenance. This
 * module deliberately has no fallback clock: a date-only answer remains
 * date-only and therefore cannot become a market-reaction anchor by accident.
 */

import { utcDateOnly } from "@/services/macro/time";

export const RELEASE_STAGES = [
  "INITIAL",
  "PRELIMINARY",
  "ADVANCE",
  "SECOND_ESTIMATE",
  "THIRD_ESTIMATE",
  "FINAL",
  "REVISION",
] as const;

export type ReleaseStage = (typeof RELEASE_STAGES)[number];

export interface ReleaseIdentity {
  readonly metricKey: string;
  /** YYYY-MM-DD period start; a calendar date, never an instant. */
  readonly referencePeriodStart: string;
  readonly releaseStage: ReleaseStage;
}

export type ReleaseTimingSourceKind =
  | "OFFICIAL_RELEASE_RECORD"
  | "OFFICIAL_SCHEDULE"
  | "OFFICIAL_DATE_METADATA";

export interface ReleaseTimingProvenance {
  /** Stable identifier of the adapter that produced this answer. */
  readonly providerId: string;
  /** Human-readable publisher/source name. */
  readonly sourceName: string;
  readonly sourceKind: ReleaseTimingSourceKind;
  /** Direct HTTPS citation for the timing fact. */
  readonly sourceUrl: string;
  /** When the provider retrieved or recorded the cited source. */
  readonly retrievedAt: Date;
}

export interface ReleaseClockFact<Instant> {
  readonly at: Instant;
  readonly sourceUrl: string;
  readonly precision: "MINUTE" | "APPROXIMATE_MINUTE";
  readonly scope: "RELEASE" | "RELATED_FILES";
}

export interface ReleaseClockFacts<Instant> {
  readonly intendedEmbargo: ReleaseClockFact<Instant> | null;
  readonly documentedPublication: ReleaseClockFact<Instant> | null;
  readonly earliestEvidencedAvailability: ReleaseClockFact<Instant> | null;
}

export type ReleaseAtKind = "DOCUMENTED_PUBLICATION" | "OFFICIAL_SCHEDULE" | "DATE_ONLY";

interface ReleaseTimingBase {
  /** YYYY-MM-DD in America/New_York for instant-bearing results. */
  readonly releaseDate: string;
  readonly provenance: ReleaseTimingProvenance;
  /** Record-backed providers expose the selected clock's meaning and any other evidenced clocks. */
  readonly releaseAtKind?: ReleaseAtKind;
  readonly timingFacts?: ReleaseClockFacts<Date>;
}

export interface VerifiedReleaseTiming extends ReleaseTimingBase {
  readonly timingStatus: "VERIFIED";
  readonly releaseAt: Date;
}

export interface ScheduledReleaseTiming extends ReleaseTimingBase {
  readonly timingStatus: "SCHEDULED";
  readonly releaseAt: Date;
}

export interface DateOnlyReleaseTiming extends ReleaseTimingBase {
  readonly timingStatus: "DATE_ONLY";
  /** Explicit null prevents a calendar date being mistaken for midnight. */
  readonly releaseAt: null;
}

export type HistoricalReleaseTiming =
  | VerifiedReleaseTiming
  | ScheduledReleaseTiming
  | DateOnlyReleaseTiming;

export interface HistoricalReleaseResolution {
  readonly identity: ReleaseIdentity;
  readonly timing: HistoricalReleaseTiming;
}

export interface HistoricalReleaseCalendarProvider {
  readonly id: string;
  resolve(
    identity: Readonly<ReleaseIdentity>,
  ): Promise<HistoricalReleaseTiming | null>;
}

const releaseStages = new Set<string>(RELEASE_STAGES);

const newYorkDayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function requireNonBlank(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  if (value !== value.trim()) {
    throw new TypeError(`${field} must not have surrounding whitespace`);
  }
  return value;
}

function requireIsoDay(value: unknown, field: string): string {
  const day = typeof value === "string" ? utcDateOnly(value) : new Date(NaN);
  if (Number.isNaN(day.getTime())) {
    throw new TypeError(`${field} must be a valid YYYY-MM-DD calendar date`);
  }
  return value as string;
}

function requireInstant(value: unknown, field: string): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new TypeError(`${field} must be a valid Date instant`);
  }
  return new Date(value.getTime());
}

function requireHttpsUrl(value: unknown, field: string): string {
  const raw = requireNonBlank(value, field);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new TypeError(`${field} must be a valid HTTPS URL`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname === "" ||
    parsed.username !== "" ||
    parsed.password !== ""
  ) {
    throw new TypeError(`${field} must be a credential-free HTTPS URL`);
  }
  return raw;
}

function newYorkIsoDay(instant: Date): string {
  const parts = newYorkDayFormatter.formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

function validateIdentity(identity: ReleaseIdentity): ReleaseIdentity {
  if (identity === null || typeof identity !== "object") {
    throw new TypeError("release identity is required");
  }
  const metricKey = requireNonBlank(identity.metricKey, "metricKey");
  const referencePeriodStart = requireIsoDay(
    identity.referencePeriodStart,
    "referencePeriodStart",
  );
  if (!releaseStages.has(identity.releaseStage)) {
    throw new TypeError("releaseStage is not a supported normalized stage");
  }
  return {
    metricKey,
    referencePeriodStart,
    releaseStage: identity.releaseStage,
  };
}

function validateProvenance(
  provenance: ReleaseTimingProvenance,
  providerId: string,
): ReleaseTimingProvenance {
  if (provenance === null || typeof provenance !== "object") {
    throw new TypeError("provenance is required");
  }
  const claimedProvider = requireNonBlank(
    provenance.providerId,
    "provenance.providerId",
  );
  if (claimedProvider !== providerId) {
    throw new TypeError("provenance.providerId must match the resolving provider");
  }
  if (
    provenance.sourceKind !== "OFFICIAL_RELEASE_RECORD" &&
    provenance.sourceKind !== "OFFICIAL_SCHEDULE" &&
    provenance.sourceKind !== "OFFICIAL_DATE_METADATA"
  ) {
    throw new TypeError("provenance.sourceKind is invalid");
  }
  return {
    providerId: claimedProvider,
    sourceName: requireNonBlank(
      provenance.sourceName,
      "provenance.sourceName",
    ),
    sourceKind: provenance.sourceKind,
    sourceUrl: requireHttpsUrl(provenance.sourceUrl, "provenance.sourceUrl"),
    retrievedAt: requireInstant(
      provenance.retrievedAt,
      "provenance.retrievedAt",
    ),
  };
}

function validateTiming(
  timing: HistoricalReleaseTiming,
  providerId: string,
): HistoricalReleaseTiming {
  if (timing === null || typeof timing !== "object") {
    throw new TypeError("provider timing result must be an object or null");
  }
  const releaseDate = requireIsoDay(timing.releaseDate, "releaseDate");
  const provenance = validateProvenance(timing.provenance, providerId);
  const kind = timing.timingStatus === "VERIFIED" ? "DOCUMENTED_PUBLICATION"
    : timing.timingStatus === "SCHEDULED" ? "OFFICIAL_SCHEDULE" : "DATE_ONLY";
  if (timing.releaseAtKind !== undefined && timing.releaseAtKind !== kind) {
    throw new TypeError("releaseAtKind must agree with timingStatus");
  }
  const metadata = {
    ...(timing.releaseAtKind === undefined ? {} : { releaseAtKind: timing.releaseAtKind }),
    ...(timing.timingFacts === undefined ? {} : { timingFacts: {
      intendedEmbargo: validateClockFact(timing.timingFacts.intendedEmbargo),
      documentedPublication: validateClockFact(timing.timingFacts.documentedPublication),
      earliestEvidencedAvailability: validateClockFact(timing.timingFacts.earliestEvidencedAvailability),
    } }),
  };

  if (timing.timingStatus === "DATE_ONLY") {
    if (timing.releaseAt !== null) {
      throw new TypeError("DATE_ONLY timing must have releaseAt null");
    }
    return { timingStatus: "DATE_ONLY", releaseDate, releaseAt: null, provenance, ...metadata };
  }

  if (
    timing.timingStatus !== "VERIFIED" &&
    timing.timingStatus !== "SCHEDULED"
  ) {
    throw new TypeError("provider returned an unsupported timingStatus");
  }

  if (
    timing.timingStatus === "VERIFIED" &&
    provenance.sourceKind !== "OFFICIAL_RELEASE_RECORD"
  ) {
    throw new TypeError(
      "VERIFIED timing requires an OFFICIAL_RELEASE_RECORD source",
    );
  }
  if (
    timing.timingStatus === "SCHEDULED" &&
    provenance.sourceKind !== "OFFICIAL_SCHEDULE"
  ) {
    throw new TypeError("SCHEDULED timing requires an OFFICIAL_SCHEDULE source");
  }

  const releaseAt = requireInstant(timing.releaseAt, "releaseAt");
  if (newYorkIsoDay(releaseAt) !== releaseDate) {
    throw new TypeError(
      "releaseAt must fall on releaseDate in America/New_York",
    );
  }
  if (timing.timingStatus === "VERIFIED" && metadata.timingFacts &&
    metadata.timingFacts.documentedPublication?.at.getTime() !== releaseAt.getTime()) {
    throw new TypeError("VERIFIED releaseAt must match the documented publication");
  }

  return timing.timingStatus === "VERIFIED"
    ? { timingStatus: "VERIFIED", releaseDate, releaseAt, provenance, ...metadata }
    : { timingStatus: "SCHEDULED", releaseDate, releaseAt, provenance, ...metadata };
}

function validateClockFact(fact: ReleaseClockFact<Date> | null): ReleaseClockFact<Date> | null {
  if (fact === null) return null;
  if (fact.precision !== "MINUTE" && fact.precision !== "APPROXIMATE_MINUTE") {
    throw new TypeError("clock fact precision is invalid");
  }
  if (fact.scope !== "RELEASE" && fact.scope !== "RELATED_FILES") {
    throw new TypeError("clock fact scope is invalid");
  }
  return { ...fact, at: requireInstant(fact.at, "clock fact at"), sourceUrl: requireHttpsUrl(fact.sourceUrl, "clock fact sourceUrl") };
}

/**
 * Validate a query, ask exactly one provider, and validate its answer before it
 * crosses into ingestion code. A missing provider result remains `null`.
 */
export async function resolveHistoricalRelease(
  provider: HistoricalReleaseCalendarProvider,
  identity: ReleaseIdentity,
): Promise<HistoricalReleaseResolution | null> {
  if (provider === null || typeof provider !== "object") {
    throw new TypeError("provider is required");
  }
  const providerId = requireNonBlank(provider.id, "provider.id");
  if (typeof provider.resolve !== "function") {
    throw new TypeError("provider.resolve must be a function");
  }

  const validatedIdentity = validateIdentity(identity);
  const candidate = await provider.resolve(validatedIdentity);
  if (candidate === null) return null;
  return {
    identity: validatedIdentity,
    timing: validateTiming(candidate, providerId),
  };
}
