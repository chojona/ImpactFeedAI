/**
 * Historical release-calendar records: the evidence-preserving output of the
 * release-timing acquisition layer (scripts/ingest/release-calendar/).
 *
 * A record is one publication event (one CPI release, one FOMC statement) with
 * every piece of timing evidence that was found for it. Records are richer
 * than the source-agnostic `HistoricalReleaseTiming` contract in
 * `release-calendar.ts`: they keep secondary evidence (research datasets), all
 * citations, the zone label the publisher printed, and reconciliation flags.
 * `createRecordCalendarProvider` projects them onto the existing contract,
 * which is the only path by which a record may become a reaction anchor.
 *
 * Timing rules (no fallback clock, ever):
 *   VERIFIED       — an official source documents that publication occurred.
 *   SCHEDULED      — only an official schedule states the clock time.
 *   DATE_ONLY      — an official document proves the date, not the time.
 *   SECONDARY_ONLY — only non-official evidence (e.g. a peer-reviewed research
 *                    dataset) supports the timing. Never projected onto the
 *                    contract; kept for research use and cross-checking.
 *
 * Conflicting publication evidence is withheld, as are conflicting
 * schedules with no publication. Differences between roles are retained.
 */

import {
  RELEASE_STAGES,
  type HistoricalReleaseCalendarProvider,
  type HistoricalReleaseTiming,
  type ReleaseAtKind,
  type ReleaseClockFact,
  type ReleaseClockFacts,
  type ReleaseIdentity,
  type ReleaseStage,
  type ReleaseTimingSourceKind,
} from "@/services/macro/release-calendar";
import { utcDateOnly } from "@/services/macro/time";

export const RELEASE_FAMILIES = [
  "BLS_CPI",
  "BLS_PPI",
  "BLS_EMPLOYMENT_SITUATION",
  "BEA_GDP",
  "BEA_PERSONAL_INCOME_OUTLAYS",
  "FOMC_STATEMENT",
] as const;
export type ReleaseFamily = (typeof RELEASE_FAMILIES)[number];

/** Canonical metric keys (src/services/macro/metrics.ts) each family publishes. */
export const FAMILY_METRIC_KEYS: Readonly<Record<ReleaseFamily, readonly string[]>> = {
  BLS_CPI: ["CPI_HEADLINE", "CPI_CORE"],
  BLS_PPI: ["PPI_HEADLINE"],
  BLS_EMPLOYMENT_SITUATION: ["PAYROLLS", "UNEMPLOYMENT_RATE"],
  BEA_GDP: ["GDP_REAL"],
  BEA_PERSONAL_INCOME_OUTLAYS: ["PCE_HEADLINE", "PCE_CORE"],
  FOMC_STATEMENT: ["FED_TARGET_UPPER"],
};

export type EvidenceSourceKind =
  | ReleaseTimingSourceKind
  | "SECONDARY_RESEARCH_DATASET";

export type CalendarTimingStatus =
  | "VERIFIED"
  | "SCHEDULED"
  | "DATE_ONLY"
  | "SECONDARY_ONLY";

/** The zone label exactly as printed by the publisher, when one was printed. */
export type StatedZone = "EST" | "EDT" | "ET" | "UTC";

export interface TimingEvidence {
  /** Adapter id, e.g. "bls-archive-local", "fed-statement", "frbsf-bauer-swanson". */
  readonly providerId: string;
  readonly sourceName: string;
  readonly sourceKind: EvidenceSourceKind;
  /** Credential-free HTTPS citation. */
  readonly sourceUrl: string;
  /** ISO instant the document was retrieved (or the operator saved it). */
  readonly retrievedAt: string;
  /** New York calendar day the evidence supports. */
  readonly releaseDate: string;
  /** ISO UTC instant, when the evidence states a clock time. */
  readonly releaseAt: string | null;
  /** A release archive can state an embargo without documenting publication. */
  readonly clockKind?: "INTENDED_EMBARGO" | "DOCUMENTED_PUBLICATION" | "EVIDENCED_AVAILABILITY";
  readonly precision?: ReleaseClockFact<string>["precision"];
  readonly scope?: ReleaseClockFact<string>["scope"];
  readonly scheduleStatus?: "CANCELLED";
  readonly scheduleUid?: string;
  readonly statedZone: StatedZone | null;
  /** Source excerpt or a description of the cited evidence. */
  readonly evidenceText: string;
  /** sha256 of the source payload, for reproducibility. */
  readonly contentSha256: string | null;
}

/** An official publication explicitly replaced a scheduled estimate for the same period. */
export interface ScheduleChange {
  readonly releaseStage: ReleaseStage;
  readonly disposition: "SUPERSEDED";
  readonly sourceUrl: string;
  readonly retrievedAt: string;
  readonly evidenceText: string;
  readonly contentSha256: string;
}

export type RecordFlag =
  | "ZONE_LABEL_MISMATCH" // printed EST/EDT disagrees with America/New_York at that instant
  | "TIME_CONFLICT" // official publications state different instants (fatal: withheld)
  | "EMBARGO_CONFLICT" // intended embargo times disagree
  | "SCHEDULE_CONFLICT" // official schedules disagree without a publication (withheld)
  | "DATE_CONFLICT" // official publications state different days (fatal: withheld)
  | "SCHEDULE_DIFFERS_FROM_RECORD" // schedule ≠ publication, e.g. a reschedule (informational)
  | "SECONDARY_DIFFERS_FROM_OFFICIAL" // research timing ≠ official timing (informational)
  | "SECONDARY_TIME_ONLY" // clock time known only from secondary evidence
  | "IMPLICIT_ANNOUNCEMENT" // pre-1994 FOMC: no explicit announcement was made
  | "UNSCHEDULED" // intermeeting / conference-call / notation-vote action
  | "REFERENCE_PERIOD_UNKNOWN" // document did not state the period measured
  | "SOURCE_URL_DATE_MISMATCH"; // the publisher's URL encodes a different day than the document states (informational)

export interface ReleaseCalendarRecord {
  readonly family: ReleaseFamily;
  readonly metricKeys: readonly string[];
  readonly identities: readonly ReleaseIdentity[];
  /** Primary reference period from the title (FOMC uses the announcement day). */
  readonly referencePeriodStart: string | null;
  readonly releaseStage: ReleaseStage;
  /** Publisher's own stage wording, e.g. "Advance Estimate", "preliminary". */
  readonly stageLabel: string | null;
  readonly releaseDate: string;
  readonly releaseAt: string | null;
  readonly releaseAtKind: ReleaseAtKind | "SECONDARY_RESEARCH";
  readonly timingFacts: ReleaseClockFacts<string>;
  readonly timePrecision: "MINUTE" | "DATE";
  readonly timingStatus: CalendarTimingStatus;
  /** FOMC only: true for intermeeting actions; null when unknown/not applicable. */
  readonly unscheduled: boolean | null;
  readonly evidence: readonly TimingEvidence[];
  readonly scheduleChanges: readonly ScheduleChange[];
  readonly flags: readonly RecordFlag[];
}

/** A single source observation before merging. */
export interface CalendarObservation {
  readonly family: ReleaseFamily;
  readonly referencePeriodStart: string | null;
  readonly releaseStage: ReleaseStage;
  readonly stageLabel: string | null;
  readonly unscheduled: boolean | null;
  readonly evidence: TimingEvidence;
  /** Explicit metric/period/stage tuples override the family defaults. */
  readonly identities?: readonly ReleaseIdentity[];
  readonly supplementalEvidence?: readonly TimingEvidence[];
  readonly scheduleChanges?: readonly ScheduleChange[];
  readonly flags: readonly RecordFlag[];
}

const ISO_UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const stages = new Set<string>(RELEASE_STAGES);
const families = new Set<string>(RELEASE_FAMILIES);

const isIsoDay = (day: string): boolean => Number.isFinite(utcDateOnly(day).getTime());

const nyDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function newYorkDayOf(instant: Date): string {
  return nyDay.format(instant);
}

function isHttpsCitation(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && u.username === "" && u.password === "" &&
      !/api_key=|registrationkey=|apikey=/i.test(u.search);
  } catch {
    return false;
  }
}

/** Throws on any evidence that could not be cited or replayed. */
export function validateEvidence(e: TimingEvidence): TimingEvidence {
  if (!e.providerId || !e.sourceName) throw new TypeError("evidence needs provider and source name");
  if (!isHttpsCitation(e.sourceUrl)) {
    throw new TypeError(`evidence sourceUrl must be credential-free HTTPS: ${e.sourceUrl}`);
  }
  if (!isIsoDay(e.releaseDate)) throw new TypeError("evidence releaseDate must be a valid YYYY-MM-DD");
  if (Number.isNaN(Date.parse(e.retrievedAt))) throw new TypeError("evidence retrievedAt invalid");
  if (e.clockKind && (e.sourceKind !== "OFFICIAL_RELEASE_RECORD" ||
    (e.clockKind !== "INTENDED_EMBARGO" && e.releaseAt === null))) {
    throw new TypeError("clock evidence requires an official release record and a supported instant");
  }
  if (e.clockKind === "DOCUMENTED_PUBLICATION" &&
    (e.scope === "RELATED_FILES" || e.precision === "APPROXIMATE_MINUTE")) {
    throw new TypeError("documented publication requires a precise clock for the release");
  }
  if (e.scheduleStatus && e.sourceKind !== "OFFICIAL_SCHEDULE") {
    throw new TypeError("schedule status requires an official schedule");
  }
  if (e.releaseAt !== null) {
    const at = new Date(e.releaseAt);
    if (!ISO_UTC_INSTANT.test(e.releaseAt) || !Number.isFinite(at.getTime()) ||
      at.toISOString() !== e.releaseAt.replace(/(\d\d:\d\d:\d\d)Z$/, "$1.000Z")) {
      throw new TypeError("evidence releaseAt must be a valid UTC instant");
    }
    if (newYorkDayOf(at) !== e.releaseDate) {
      throw new TypeError(`evidence releaseAt ${e.releaseAt} is not on ${e.releaseDate} in New York`);
    }
  }
  if (e.evidenceText.trim() === "") throw new TypeError("evidence must quote its source text");
  return e;
}

function validateObservation(o: CalendarObservation): CalendarObservation {
  if (!families.has(o.family)) throw new TypeError(`unknown family ${o.family}`);
  if (!stages.has(o.releaseStage)) throw new TypeError(`unknown stage ${o.releaseStage}`);
  if (o.referencePeriodStart !== null && !isIsoDay(o.referencePeriodStart)) {
    throw new TypeError("referencePeriodStart must be YYYY-MM-DD or null");
  }
  validateEvidence(o.evidence);
  for (const e of o.supplementalEvidence ?? []) validateEvidence(e);
  for (const id of o.identities ?? []) {
    if (!FAMILY_METRIC_KEYS[o.family].includes(id.metricKey) ||
      !isIsoDay(id.referencePeriodStart) || !stages.has(id.releaseStage)) {
      throw new TypeError(`invalid identity for ${o.family}`);
    }
  }
  for (const change of o.scheduleChanges ?? []) {
    if (o.evidence.sourceKind !== "OFFICIAL_RELEASE_RECORD" || !o.referencePeriodStart ||
      !stages.has(change.releaseStage) || change.releaseStage === o.releaseStage ||
      !isHttpsCitation(change.sourceUrl) || !Number.isFinite(Date.parse(change.retrievedAt)) ||
      !change.evidenceText.trim() || !change.contentSha256) {
      throw new TypeError("invalid evidence for replaced schedule");
    }
  }
  return o;
}

const KIND_RANK: Record<EvidenceSourceKind, number> = {
  OFFICIAL_RELEASE_RECORD: 0,
  OFFICIAL_SCHEDULE: 1,
  OFFICIAL_DATE_METADATA: 2,
  SECONDARY_RESEARCH_DATASET: 3,
};
const isOfficial = (e: TimingEvidence): boolean => e.sourceKind !== "SECONDARY_RESEARCH_DATASET";
const isPublication = (e: TimingEvidence): boolean =>
  e.sourceKind === "OFFICIAL_RELEASE_RECORD" || e.sourceKind === "OFFICIAL_DATE_METADATA";

function identityKey(id: ReleaseIdentity): string {
  return `${id.metricKey}|${id.referencePeriodStart}|${id.releaseStage}`;
}

function familyIdentities(family: ReleaseFamily, referencePeriodStart: string | null, releaseStage: ReleaseStage): ReleaseIdentity[] {
  return referencePeriodStart === null ? [] : FAMILY_METRIC_KEYS[family].map((metricKey) => ({
    metricKey, referencePeriodStart, releaseStage,
  }));
}

/**
 * Group key. FOMC statements are one per announcement day; data releases are
 * one per (family, reference period, stage) when the period is known, else
 * per (family, release day) so an unknown period never merges two releases.
 */
export function observationKey(o: CalendarObservation): string {
  if (o.family === "FOMC_STATEMENT" || o.referencePeriodStart === null) {
    return `${o.family}|day:${o.evidence.releaseDate}`;
  }
  return `${o.family}|${o.referencePeriodStart}|${o.releaseStage}`;
}

function pickFirst<T>(values: readonly (T | null)[]): T | null {
  for (const v of values) if (v !== null) return v;
  return null;
}

function clockFact(e: TimingEvidence | undefined): ReleaseClockFact<string> | null {
  if (!e?.releaseAt) return null;
  return { at: e.releaseAt, sourceUrl: e.sourceUrl, precision: e.precision ?? "MINUTE", scope: e.scope ?? "RELEASE" };
}

function evidenceOrder(a: TimingEvidence, b: TimingEvidence): number {
  return KIND_RANK[a.sourceKind] - KIND_RANK[b.sourceKind] ||
    a.sourceUrl.localeCompare(b.sourceUrl) || a.releaseDate.localeCompare(b.releaseDate) ||
    (a.releaseAt ?? "").localeCompare(b.releaseAt ?? "") || a.evidenceText.localeCompare(b.evidenceText) ||
    a.retrievedAt.localeCompare(b.retrievedAt) || (a.contentSha256 ?? "").localeCompare(b.contentSha256 ?? "");
}

function mergeGroup(group: readonly CalendarObservation[]): ReleaseCalendarRecord {
  const sorted = [...group].sort((a, b) => evidenceOrder(a.evidence, b.evidence));
  const flags = new Set<RecordFlag>(sorted.flatMap((o) => o.flags));
  const ev = sorted.flatMap((o) => [o.evidence, ...(o.supplementalEvidence ?? [])]).sort(evidenceOrder);

  // Compare publication, plans and research separately. An embargo clock
  // and a documented publication can differ for the same release.
  const publications = ev.filter((e) => isPublication(e) && e.clockKind !== "EVIDENCED_AVAILABILITY");
  const schedules = ev.filter((e) => e.sourceKind === "OFFICIAL_SCHEDULE");
  const secondaries = ev.filter((e) => !isOfficial(e));

  if (new Set(publications.map((e) => e.releaseDate)).size > 1) flags.add("DATE_CONFLICT");
  const documented = publications.filter((e) => e.clockKind === "DOCUMENTED_PUBLICATION" && e.releaseAt);
  const embargoes = publications.filter((e) => e.clockKind === "INTENDED_EMBARGO" && e.releaseAt);
  if (new Set(documented.map((e) => Date.parse(e.releaseAt ?? ""))).size > 1) flags.add("TIME_CONFLICT");
  if (new Set(embargoes.map((e) => Date.parse(e.releaseAt ?? ""))).size > 1) flags.add("EMBARGO_CONFLICT");
  const scheduledInstants = new Set(schedules.flatMap((e) => e.releaseAt ? [Date.parse(e.releaseAt)] : []));
  if (!publications.length && (scheduledInstants.size > 1 || new Set(schedules.map((e) => e.releaseDate)).size > 1)) {
    flags.add("SCHEDULE_CONFLICT");
  }

  const publicationConflict = flags.has("DATE_CONFLICT") || flags.has("TIME_CONFLICT");
  const timedRecord = publicationConflict ? undefined : documented[0];
  const publication = timedRecord ?? publications[0];
  const schedule = schedules.find((e) => e.releaseAt) ?? schedules[0];
  const availability = ev.filter((e) => e.clockKind === "EVIDENCED_AVAILABILITY" && e.releaseAt !== null)
    .sort((a, b) => Date.parse(a.releaseAt ?? "") - Date.parse(b.releaseAt ?? ""))[0];

  let timingStatus: CalendarTimingStatus;
  let releaseAtKind: ReleaseCalendarRecord["releaseAtKind"];
  let chosen: TimingEvidence;
  if (timedRecord) {
    timingStatus = "VERIFIED";
    releaseAtKind = "DOCUMENTED_PUBLICATION";
    chosen = timedRecord;
  } else if (publication) {
    // A published date beats any scheduled clock time for the same release.
    timingStatus = "DATE_ONLY";
    releaseAtKind = "DATE_ONLY";
    chosen = publication;
  } else if (schedule?.releaseAt && !flags.has("SCHEDULE_CONFLICT")) {
    timingStatus = "SCHEDULED";
    releaseAtKind = "OFFICIAL_SCHEDULE";
    chosen = schedule;
  } else if (schedule) {
    timingStatus = "DATE_ONLY";
    releaseAtKind = "DATE_ONLY";
    chosen = schedule;
  } else {
    timingStatus = "SECONDARY_ONLY";
    releaseAtKind = "SECONDARY_RESEARCH";
    chosen = ev[0];
  }

  const publicationClock = timedRecord?.releaseAt ?? (flags.has("EMBARGO_CONFLICT") ? null : embargoes[0]?.releaseAt);
  if (publication && schedules.some((s) =>
    s.releaseDate !== publication.releaseDate ||
    (publicationClock && s.releaseAt && Date.parse(s.releaseAt) !== Date.parse(publicationClock)))) {
    flags.add("SCHEDULE_DIFFERS_FROM_RECORD");
  }
  const anchor = timedRecord ?? (publication ? { releaseDate: publication.releaseDate, releaseAt: null } : schedule);
  if (anchor && secondaries.some((s) =>
    s.releaseDate !== anchor.releaseDate ||
    (anchor.releaseAt !== null && s.releaseAt !== null && Date.parse(s.releaseAt) !== Date.parse(anchor.releaseAt)))) {
    flags.add("SECONDARY_DIFFERS_FROM_OFFICIAL");
  }
  if (timingStatus === "DATE_ONLY" && secondaries.some((s) => s.releaseAt)) flags.add("SECONDARY_TIME_ONLY");

  const releaseAt = timingStatus === "DATE_ONLY" ? null : chosen.releaseAt;
  const first = sorted[0];
  const unscheduledVotes = sorted.map((o) => o.unscheduled);
  const unscheduled = unscheduledVotes.includes(true) ? true : pickFirst(unscheduledVotes);
  if (unscheduled === true) flags.add("UNSCHEDULED");
  const referencePeriodStart = pickFirst(sorted.map((o) => o.referencePeriodStart));
  if (referencePeriodStart === null) flags.add("REFERENCE_PERIOD_UNKNOWN");
  else flags.delete("REFERENCE_PERIOD_UNKNOWN");
  const explicit = sorted.filter((o) => o.identities !== undefined &&
    (publications.length ? isPublication(o.evidence) : o.evidence.sourceKind === "OFFICIAL_SCHEDULE"));
  const identities = explicit.length
    ? [...new Map(explicit.flatMap((o) => o.identities ?? []).map((id) => [identityKey(id), id])).values()]
        .sort((a, b) => identityKey(a).localeCompare(identityKey(b)))
    : familyIdentities(first.family, referencePeriodStart, first.releaseStage);

  return {
    family: first.family,
    metricKeys: referencePeriodStart === null ? FAMILY_METRIC_KEYS[first.family] : [...new Set(identities.map((id) => id.metricKey))],
    identities,
    referencePeriodStart,
    releaseStage: first.releaseStage,
    stageLabel: pickFirst(sorted.map((o) => o.stageLabel)),
    releaseDate: chosen.releaseDate,
    releaseAt,
    releaseAtKind,
    timingFacts: {
      intendedEmbargo: flags.has("DATE_CONFLICT") || flags.has("EMBARGO_CONFLICT") ? null : clockFact(embargoes[0]),
      documentedPublication: clockFact(timedRecord),
      earliestEvidencedAvailability: flags.has("DATE_CONFLICT") ? null : clockFact(availability),
    },
    timePrecision: releaseAt ? "MINUTE" : "DATE",
    timingStatus,
    unscheduled,
    evidence: ev,
    scheduleChanges: sorted.flatMap((o) => o.scheduleChanges ?? []),
    flags: [...flags].sort(),
  };
}

/**
 * Merge source observations into records. Deterministic: the output order and
 * content depend only on the input set, never on input order.
 */
export function mergeObservations(
  observations: readonly CalendarObservation[],
): ReleaseCalendarRecord[] {
  const superseded = new Set<string>();
  const cancelled = new Set<string>();
  const publicationGroupsByIdentity = new Map<string, Set<string>>();
  const scheduleKey = (o: CalendarObservation): string =>
    `${o.evidence.providerId}|${o.evidence.scheduleUid ?? `${observationKey(o)}|${o.evidence.releaseDate}`}`;
  for (const o of observations) {
    validateObservation(o);
    if (o.evidence.scheduleStatus === "CANCELLED") cancelled.add(scheduleKey(o));
    for (const change of o.scheduleChanges ?? []) {
      superseded.add(observationKey({ ...o, releaseStage: change.releaseStage }));
    }
    if (isPublication(o.evidence)) {
      for (const identity of o.identities ?? familyIdentities(o.family, o.referencePeriodStart, o.releaseStage)) {
        const key = identityKey(identity);
        const owners = publicationGroupsByIdentity.get(key) ?? new Set<string>();
        owners.add(observationKey(o));
        publicationGroupsByIdentity.set(key, owners);
      }
    }
  }

  const groups = new Map<string, CalendarObservation[]>();
  for (const o of observations) {
    let k = observationKey(o);
    if (o.evidence.sourceKind === "OFFICIAL_SCHEDULE") {
      if (cancelled.has(scheduleKey(o)) || superseded.has(k)) continue;
      // Keep retained schedules as evidence with the bundle if a single
      // publication covers every metric and period named by the schedule.
      const ids = o.identities ?? familyIdentities(o.family, o.referencePeriodStart, o.releaseStage);
      const owners = ids.map((id) => publicationGroupsByIdentity.get(identityKey(id)));
      const targets = new Set(owners.flatMap((group) => [...(group ?? [])]));
      if (targets.size === 1 && owners.every((group) => group?.size === 1)) k = [...targets][0];
    }
    const g = groups.get(k);
    if (g) g.push(o);
    else groups.set(k, [o]);
  }
  // A dated-only observation (unknown period) joins a period-keyed group of the
  // same family and day, so a schedule entry and a record of one release merge.
  for (const [k, g] of [...groups]) {
    if (!k.includes("|day:") || g[0].family === "FOMC_STATEMENT") continue;
    const targets = [...groups.entries()].filter(
      ([k2, g2]) => k2 !== k && !k2.includes("|day:") && g2[0].family === g[0].family &&
        g2.some((o) => o.evidence.releaseDate === g[0].evidence.releaseDate),
    );
    if (targets.length === 1) {
      targets[0][1].push(...g);
      groups.delete(k);
    }
  }
  return [...groups.values()]
    .map(mergeGroup)
    .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate) ||
      a.family.localeCompare(b.family) || a.releaseStage.localeCompare(b.releaseStage) ||
      (a.referencePeriodStart ?? "").localeCompare(b.referencePeriodStart ?? ""));
}

export const RECORD_PROVIDER_ID = "impactfeed-release-calendar-records";

/** All lookup identities for the release. Rebuild snapshots that predate this array. */
export function recordIdentities(r: ReleaseCalendarRecord): ReleaseIdentity[] {
  return [...(r.identities ?? [])];
}

/** Project a record with supported evidence onto the contract. */
export function toHistoricalReleaseTiming(
  r: ReleaseCalendarRecord,
): HistoricalReleaseTiming | null {
  if (r.timingStatus === "SECONDARY_ONLY" || r.releaseAtKind === "SECONDARY_RESEARCH" ||
    r.releaseAtKind === undefined || r.timingFacts === undefined ||
    r.flags.some((flag) => flag === "DATE_CONFLICT" || flag === "TIME_CONFLICT" || flag === "SCHEDULE_CONFLICT")) return null;
  const chosen = r.evidence.find((e) =>
    r.timingStatus === "VERIFIED"
      ? e.clockKind === "DOCUMENTED_PUBLICATION" && e.releaseAt === r.releaseAt
      : r.timingStatus === "SCHEDULED"
        ? e.sourceKind === "OFFICIAL_SCHEDULE" && e.releaseAt === r.releaseAt
        : isOfficial(e) && e.clockKind !== "EVIDENCED_AVAILABILITY" && e.releaseDate === r.releaseDate,
  );
  if (!chosen || chosen.sourceKind === "SECONDARY_RESEARCH_DATASET") return null;
  const provenance = {
    providerId: RECORD_PROVIDER_ID,
    sourceName: chosen.sourceName,
    sourceKind: chosen.sourceKind,
    sourceUrl: chosen.sourceUrl,
    retrievedAt: new Date(chosen.retrievedAt),
  };
  const toDate = (fact: ReleaseClockFact<string> | null): ReleaseClockFact<Date> | null =>
    fact === null ? null : { ...fact, at: new Date(fact.at) };
  const metadata = {
    releaseAtKind: r.releaseAtKind,
    timingFacts: {
      intendedEmbargo: toDate(r.timingFacts.intendedEmbargo),
      documentedPublication: toDate(r.timingFacts.documentedPublication),
      earliestEvidencedAvailability: toDate(r.timingFacts.earliestEvidencedAvailability),
    },
  };
  if (r.timingStatus === "DATE_ONLY" || r.releaseAt === null) {
    return { timingStatus: "DATE_ONLY", releaseDate: r.releaseDate, releaseAt: null, provenance, ...metadata };
  }
  return {
    timingStatus: r.timingStatus,
    releaseDate: r.releaseDate,
    releaseAt: new Date(r.releaseAt),
    provenance,
    ...metadata,
  };
}

/**
 * A `HistoricalReleaseCalendarProvider` over a fixed record set. Records with
 * date or time conflicts are withheld (null) rather than guessed between.
 */
export function createRecordCalendarProvider(
  records: readonly ReleaseCalendarRecord[],
): HistoricalReleaseCalendarProvider {
  const index = new Map<string, ReleaseCalendarRecord>();
  const ambiguous = new Set<string>();
  for (const r of records) {
    for (const id of recordIdentities(r)) {
      const k = identityKey(id);
      if (index.has(k)) ambiguous.add(k);
      index.set(k, r);
    }
  }
  return {
    id: RECORD_PROVIDER_ID,
    async resolve(identity) {
      const k = identityKey(identity);
      const r = index.get(k);
      if (!r || ambiguous.has(k)) return null;
      return toHistoricalReleaseTiming(r);
    },
  };
}
