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
 *   VERIFIED       — an official release record states the clock time.
 *   SCHEDULED      — only an official schedule states the clock time.
 *   DATE_ONLY      — an official document proves the date, not the time.
 *   SECONDARY_ONLY — only non-official evidence (e.g. a peer-reviewed research
 *                    dataset) supports the timing. Never projected onto the
 *                    contract; kept for research use and cross-checking.
 *
 * Conflicts: only official publication evidence can conflict fatally
 * (DATE_CONFLICT / TIME_CONFLICT → withheld). Schedules and research data that
 * disagree with the publication are informational flags; the publication wins.
 */

import {
  RELEASE_STAGES,
  type HistoricalReleaseCalendarProvider,
  type HistoricalReleaseTiming,
  type ReleaseIdentity,
  type ReleaseStage,
  type ReleaseTimingSourceKind,
} from "@/services/macro/release-calendar";

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
  readonly statedZone: StatedZone | null;
  /** Verbatim text the timing was parsed from (embargo line, ICS DTSTART…). */
  readonly evidenceText: string;
  /** sha256 of the source payload, for reproducibility. */
  readonly contentSha256: string | null;
}

export type RecordFlag =
  | "ZONE_LABEL_MISMATCH" // printed EST/EDT disagrees with America/New_York at that instant
  | "TIME_CONFLICT" // official publications state different instants (fatal: withheld)
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
  /** YYYY-MM-DD start of the period measured; FOMC uses the announcement day. */
  readonly referencePeriodStart: string | null;
  readonly releaseStage: ReleaseStage;
  /** Publisher's own stage wording, e.g. "Advance Estimate", "preliminary". */
  readonly stageLabel: string | null;
  readonly releaseDate: string;
  readonly releaseAt: string | null;
  readonly timePrecision: "MINUTE" | "DATE";
  readonly timingStatus: CalendarTimingStatus;
  /** FOMC only: true for intermeeting actions; null when unknown/not applicable. */
  readonly unscheduled: boolean | null;
  readonly evidence: readonly TimingEvidence[];
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
  readonly flags: readonly RecordFlag[];
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const stages = new Set<string>(RELEASE_STAGES);
const families = new Set<string>(RELEASE_FAMILIES);

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
  if (!ISO_DAY.test(e.releaseDate)) throw new TypeError("evidence releaseDate must be YYYY-MM-DD");
  if (Number.isNaN(Date.parse(e.retrievedAt))) throw new TypeError("evidence retrievedAt invalid");
  if (e.releaseAt !== null) {
    const at = new Date(e.releaseAt);
    if (Number.isNaN(at.getTime())) throw new TypeError("evidence releaseAt invalid");
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
  if (o.referencePeriodStart !== null && !ISO_DAY.test(o.referencePeriodStart)) {
    throw new TypeError("referencePeriodStart must be YYYY-MM-DD or null");
  }
  validateEvidence(o.evidence);
  return o;
}

const KIND_RANK: Record<EvidenceSourceKind, number> = {
  OFFICIAL_RELEASE_RECORD: 0,
  OFFICIAL_SCHEDULE: 1,
  OFFICIAL_DATE_METADATA: 2,
  SECONDARY_RESEARCH_DATASET: 3,
};
const isOfficial = (e: TimingEvidence): boolean => e.sourceKind !== "SECONDARY_RESEARCH_DATASET";

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

function mergeGroup(group: readonly CalendarObservation[]): ReleaseCalendarRecord {
  const sorted = [...group].sort(
    (a, b) => KIND_RANK[a.evidence.sourceKind] - KIND_RANK[b.evidence.sourceKind] ||
      a.evidence.sourceUrl.localeCompare(b.evidence.sourceUrl),
  );
  const flags = new Set<RecordFlag>(sorted.flatMap((o) => o.flags));
  const ev = sorted.map((o) => o.evidence);

  // Conflict policy. Only official PUBLICATION evidence (a release record, or
  // official date metadata about the publication) can conflict fatally. A
  // schedule is a plan and a research dataset is a reconstruction: when either
  // disagrees with the publication, the publication determines the timing and
  // the disagreement is recorded as an informational flag.
  const publications = ev.filter(
    (e) => e.sourceKind === "OFFICIAL_RELEASE_RECORD" || e.sourceKind === "OFFICIAL_DATE_METADATA",
  );
  const schedules = ev.filter((e) => e.sourceKind === "OFFICIAL_SCHEDULE");
  const secondaries = ev.filter((e) => !isOfficial(e));

  if (new Set(publications.map((e) => e.releaseDate)).size > 1) flags.add("DATE_CONFLICT");
  const publishedInstants = new Set(publications.filter((e) => e.releaseAt).map((e) => e.releaseAt));
  if (publishedInstants.size > 1) flags.add("TIME_CONFLICT");

  const timedRecord = publications.find((e) => e.sourceKind === "OFFICIAL_RELEASE_RECORD" && e.releaseAt);
  const publication = timedRecord ?? publications[0];
  const schedule = schedules.find((e) => e.releaseAt) ?? schedules[0];

  let timingStatus: CalendarTimingStatus;
  let chosen: TimingEvidence;
  if (timedRecord) {
    timingStatus = "VERIFIED";
    chosen = timedRecord;
  } else if (publication) {
    // A published date beats any scheduled clock time for the same release.
    timingStatus = "DATE_ONLY";
    chosen = publication;
  } else if (schedule?.releaseAt) {
    timingStatus = "SCHEDULED";
    chosen = schedule;
  } else if (schedule) {
    timingStatus = "DATE_ONLY";
    chosen = schedule;
  } else {
    timingStatus = "SECONDARY_ONLY";
    chosen = ev[0];
  }

  if (publication && schedules.some((s) =>
    s.releaseDate !== publication.releaseDate ||
    (publication.releaseAt !== null && s.releaseAt !== null && s.releaseAt !== publication.releaseAt))) {
    flags.add("SCHEDULE_DIFFERS_FROM_RECORD");
  }
  const anchor = publication ?? (schedule?.releaseAt ? schedule : null);
  if (anchor && secondaries.some((s) =>
    s.releaseDate !== anchor.releaseDate ||
    (anchor.releaseAt !== null && s.releaseAt !== null && s.releaseAt !== anchor.releaseAt))) {
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

  return {
    family: first.family,
    metricKeys: FAMILY_METRIC_KEYS[first.family],
    referencePeriodStart,
    releaseStage: first.releaseStage,
    stageLabel: pickFirst(sorted.map((o) => o.stageLabel)),
    releaseDate: chosen.releaseDate,
    releaseAt,
    timePrecision: releaseAt ? "MINUTE" : "DATE",
    timingStatus,
    unscheduled,
    evidence: ev,
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
  const groups = new Map<string, CalendarObservation[]>();
  for (const o of observations) {
    validateObservation(o);
    const k = observationKey(o);
    const g = groups.get(k);
    if (g) g.push(o);
    else groups.set(k, [o]);
  }
  // A dated-only observation (unknown period) joins a period-keyed group of the
  // same family and day, so a schedule entry and a record of one release merge.
  for (const [k, g] of [...groups]) {
    if (!k.includes("|day:") || g[0].family === "FOMC_STATEMENT") continue;
    const target = [...groups.entries()].find(
      ([k2, g2]) => k2 !== k && !k2.includes("|day:") && g2[0].family === g[0].family &&
        g2.some((o) => o.evidence.releaseDate === g[0].evidence.releaseDate),
    );
    if (target) {
      target[1].push(...g);
      groups.delete(k);
    }
  }
  return [...groups.values()]
    .map(mergeGroup)
    .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate) ||
      a.family.localeCompare(b.family) || a.releaseStage.localeCompare(b.releaseStage));
}

export const RECORD_PROVIDER_ID = "impactfeed-release-calendar-records";

/** The identity a record answers for one metric. FOMC uses the announcement day. */
export function recordIdentities(r: ReleaseCalendarRecord): ReleaseIdentity[] {
  const period = r.family === "FOMC_STATEMENT" ? r.releaseDate : r.referencePeriodStart;
  if (period === null) return [];
  return r.metricKeys.map((metricKey) => ({
    metricKey,
    referencePeriodStart: period,
    releaseStage: r.releaseStage,
  }));
}

/** Project a record onto the contract; SECONDARY_ONLY yields null. */
export function toHistoricalReleaseTiming(
  r: ReleaseCalendarRecord,
): HistoricalReleaseTiming | null {
  if (r.timingStatus === "SECONDARY_ONLY") return null;
  const chosen = r.evidence.find((e) =>
    r.timingStatus === "VERIFIED"
      ? e.sourceKind === "OFFICIAL_RELEASE_RECORD" && e.releaseAt === r.releaseAt
      : r.timingStatus === "SCHEDULED"
        ? e.sourceKind === "OFFICIAL_SCHEDULE" && e.releaseAt === r.releaseAt
        : e.sourceKind !== "SECONDARY_RESEARCH_DATASET" && e.releaseDate === r.releaseDate,
  );
  if (!chosen || chosen.sourceKind === "SECONDARY_RESEARCH_DATASET") return null;
  const provenance = {
    providerId: RECORD_PROVIDER_ID,
    sourceName: chosen.sourceName,
    sourceKind: chosen.sourceKind,
    sourceUrl: chosen.sourceUrl,
    retrievedAt: new Date(chosen.retrievedAt),
  };
  if (r.timingStatus === "DATE_ONLY" || r.releaseAt === null) {
    return { timingStatus: "DATE_ONLY", releaseDate: r.releaseDate, releaseAt: null, provenance };
  }
  return {
    timingStatus: r.timingStatus,
    releaseDate: r.releaseDate,
    releaseAt: new Date(r.releaseAt),
    provenance,
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
      const k = `${id.metricKey}|${id.referencePeriodStart}|${id.releaseStage}`;
      if (index.has(k)) ambiguous.add(k);
      index.set(k, r);
    }
  }
  return {
    id: RECORD_PROVIDER_ID,
    async resolve(identity) {
      const k = `${identity.metricKey}|${identity.referencePeriodStart}|${identity.releaseStage}`;
      const r = index.get(k);
      if (!r || ambiguous.has(k)) return null;
      if (r.flags.includes("DATE_CONFLICT") || r.flags.includes("TIME_CONFLICT")) return null;
      return toHistoricalReleaseTiming(r);
    },
  };
}
