/**
 * Pure audit functions over the data-source registry.
 *
 * - `validateRegistry`: integrity rules (fails the test suite when violated).
 * - `buildCoverageAudit`: per-provider counts shaped for the /quality page.
 * - `assessCoverage`: "can series X give resolution R for this date range, and
 *   how do we know?" (availability, graded TESTED > ADVERTISED > UNAVAILABLE),
 *   reported separately from "may it be used for point-in-time research?"
 *   (suitability: point-in-time status, conditions, licensing, blockers).
 *   TESTED availability never implies research suitability.
 *
 * No I/O. `today` is always injected so results are deterministic.
 */
import type {
  CoverageClaim,
  DataProviderEntry,
  DataSeriesEntry,
  DataSourceRegistry,
  IsoDate,
  LicensingTerms,
  Permission,
  PointInTimeEligibility,
  Resolution,
} from "@/types/dataSources";

// ── Dates ──────────────────────────────────────────────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function toMs(date: IsoDate): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function addDays(date: IsoDate, days: number): IsoDate {
  return new Date(toMs(date) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toMs(to) - toMs(from)) / DAY_MS);
}

// ── Validation ─────────────────────────────────────────────────────────────

export type RegistryIssueCode =
  | "DUPLICATE_ID"
  | "BAD_SERIES_ID"
  | "BAD_DATE"
  | "INVERTED_RANGE"
  | "TESTED_WITHOUT_DATE"
  | "TESTED_IN_FUTURE"
  | "DATE_ON_UNTESTED_CLAIM"
  | "ADVERTISED_WITHOUT_CITATION"
  | "UNAVAILABLE_WITHOUT_REASON"
  | "UNAVAILABLE_WITHOUT_EVIDENCE"
  | "ROLLING_WITH_FIXED_DATES"
  | "OPEN_RANGE_WITHOUT_ROLLING"
  | "EMPTY_EVIDENCE"
  | "NON_HTTPS_URL"
  | "VALIDATION_DATE_MISMATCH"
  | "AUTH_MISSING_ENV_VAR"
  | "BAD_ENV_VAR_NAME"
  | "NONZERO_COST"
  | "PIT_ELIGIBLE_WITHOUT_BASIS"
  | "CONTRADICTORY_COVERAGE"
  | "POSSIBLE_SECRET";

export interface RegistryIssue {
  readonly code: RegistryIssueCode;
  readonly path: string;
  readonly message: string;
}

const ENV_VAR = /^[A-Z][A-Z0-9_]*$/;
const SERIES_SLUG = /^[A-Za-z0-9_.^=-]+$/;

/** Patterns that look like a credential value rather than metadata. */
const SECRET_PATTERNS: readonly RegExp[] = [
  /\b(?:api_?key|apikey|registrationkey|token|secret)\s*[=:]\s*["']?[A-Za-z0-9]{8,}/i,
  /\b[a-f0-9]{32}\b/, // FRED / BLS key shape
  /\b(?=[A-Z0-9]{16}\b)(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{16}\b/, // Alpha Vantage key shape
];

function collectStrings(value: unknown, path: string, out: [string, string][]): void {
  if (typeof value === "string") out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((v, i) => collectStrings(v, `${path}[${i}]`, out));
  else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) collectStrings(v, `${path}.${k}`, out);
  }
}

function checkUrl(url: string | null | undefined, path: string, issues: RegistryIssue[]): void {
  if (url != null && !url.startsWith("https://")) {
    issues.push({ code: "NON_HTTPS_URL", path, message: `URL must be https: ${url}` });
  }
}

function validateClaim(
  claim: CoverageClaim,
  path: string,
  asOf: IsoDate,
  issues: RegistryIssue[],
): void {
  const add = (code: RegistryIssueCode, message: string) => issues.push({ code, path, message });

  for (const [field, value] of [
    ["start", claim.start],
    ["end", claim.end],
    ["testedOn", claim.testedOn],
  ] as const) {
    if (value != null && !isIsoDate(value)) add("BAD_DATE", `${field} is not YYYY-MM-DD: ${value}`);
  }
  if (claim.start && claim.end && isIsoDate(claim.start) && isIsoDate(claim.end) && claim.start > claim.end) {
    add("INVERTED_RANGE", `start ${claim.start} is after end ${claim.end}`);
  }
  if (claim.evidence.trim() === "") add("EMPTY_EVIDENCE", "evidence is empty");
  checkUrl(claim.citationUrl, `${path}.citationUrl`, issues);

  if (claim.rollingWindow) {
    if (claim.start !== null || claim.end !== null) {
      add("ROLLING_WITH_FIXED_DATES", "a rolling window must leave start and end null");
    }
  } else if (claim.status !== "UNAVAILABLE" && claim.start === null) {
    add("OPEN_RANGE_WITHOUT_ROLLING", "a covered range needs a start date or a rolling window");
  }

  switch (claim.status) {
    case "TESTED":
      if (!claim.testedOn) add("TESTED_WITHOUT_DATE", "TESTED claims need testedOn");
      else if (isIsoDate(claim.testedOn) && claim.testedOn > asOf) {
        add("TESTED_IN_FUTURE", `testedOn ${claim.testedOn} is after registry asOf ${asOf}`);
      }
      if (claim.end === null && !claim.rollingWindow) {
        add("OPEN_RANGE_WITHOUT_ROLLING", "a TESTED range must state the last date observed");
      }
      break;
    case "ADVERTISED":
      if (claim.testedOn) add("DATE_ON_UNTESTED_CLAIM", "ADVERTISED claims must not carry testedOn");
      if (!claim.citationUrl) add("ADVERTISED_WITHOUT_CITATION", "ADVERTISED claims need citationUrl");
      break;
    case "UNAVAILABLE":
      if (!claim.unavailableReason) add("UNAVAILABLE_WITHOUT_REASON", "UNAVAILABLE claims need unavailableReason");
      if (!claim.testedOn && !claim.citationUrl) {
        add("UNAVAILABLE_WITHOUT_EVIDENCE", "UNAVAILABLE claims need testedOn or citationUrl");
      }
      if (claim.testedOn && isIsoDate(claim.testedOn) && claim.testedOn > asOf) {
        add("TESTED_IN_FUTURE", `testedOn ${claim.testedOn} is after registry asOf ${asOf}`);
      }
      break;
  }
}

function validateSeries(
  series: DataSeriesEntry,
  provider: DataProviderEntry,
  path: string,
  asOf: IsoDate,
  issues: RegistryIssue[],
): void {
  const prefix = `${provider.id}:`;
  if (!series.id.startsWith(prefix) || !SERIES_SLUG.test(series.id.slice(prefix.length))) {
    issues.push({
      code: "BAD_SERIES_ID",
      path,
      message: `series id must be "${prefix}<slug>" (letters, digits, _ . ^ = -), got "${series.id}"`,
    });
  }
  series.coverage.forEach((c, i) => validateClaim(c, `${path}.coverage[${i}]`, asOf, issues));
  checkContradictions(series, path, asOf, issues);

  // ELIGIBLE means "usable as-is at an exact cutoff". A date-only publication
  // time cannot place a value before or after an intraday cutoff, so it is at
  // most CONDITIONAL, whatever the revision behaviour.
  const pit = series.pointInTime;
  if (
    pit.status === "ELIGIBLE" &&
    (series.revisions.kind === "unknown" ||
      series.revisions.kind === "revised_without_vintages" ||
      series.publication.precision !== "instant")
  ) {
    issues.push({
      code: "PIT_ELIGIBLE_WITHOUT_BASIS",
      path: `${path}.pointInTime`,
      message:
        "ELIGIBLE needs an instant-precision publication time and known revision behaviour (not revised in place). Date-only timing is at most CONDITIONAL",
    });
  }
}

/**
 * Within one series, an UNAVAILABLE claim must not overlap a TESTED claim with
 * the same resolution and access tier: the registry would then say the same
 * data both was and was not obtained. A gap in a different schema or product
 * belongs in its own series entry.
 */
function checkContradictions(series: DataSeriesEntry, path: string, asOf: IsoDate, issues: RegistryIssue[]): void {
  const tested = series.coverage.filter((c) => c.status === "TESTED");
  series.coverage.forEach((u, i) => {
    if (u.status !== "UNAVAILABLE") return;
    const clash = tested.find(
      (t) => t.resolution === u.resolution && t.accessTier === u.accessTier && spansIntersect(t, u, asOf),
    );
    if (clash) {
      issues.push({
        code: "CONTRADICTORY_COVERAGE",
        path: `${path}.coverage[${i}]`,
        message: `UNAVAILABLE ${u.resolution}/${u.accessTier} overlaps a TESTED claim for the same resolution and tier`,
      });
    }
  });
}

function spansIntersect(a: CoverageClaim, b: CoverageClaim, today: IsoDate): boolean {
  const x = claimSpan(a, today);
  const y = claimSpan(b, today);
  // A null bound is open-ended.
  return (x.start === null || y.end === null || x.start <= y.end) && (y.start === null || x.end === null || y.start <= x.end);
}

function newestTestedOn(provider: DataProviderEntry): IsoDate | null {
  let newest: IsoDate | null = null;
  for (const s of provider.series) {
    for (const c of s.coverage) {
      if (c.status === "TESTED" && c.testedOn && (newest === null || c.testedOn > newest)) newest = c.testedOn;
    }
  }
  return newest;
}

export function validateRegistry(registry: DataSourceRegistry): RegistryIssue[] {
  const issues: RegistryIssue[] = [];
  const providerIds = new Set<string>();
  const seriesIds = new Set<string>();

  if (!isIsoDate(registry.asOf)) {
    issues.push({ code: "BAD_DATE", path: "asOf", message: `asOf is not YYYY-MM-DD: ${registry.asOf}` });
  }

  registry.providers.forEach((p, pi) => {
    const path = `providers[${pi}](${p.id})`;
    if (providerIds.has(p.id)) issues.push({ code: "DUPLICATE_ID", path, message: `duplicate provider id ${p.id}` });
    providerIds.add(p.id);

    checkUrl(p.homepage, `${path}.homepage`, issues);
    checkUrl(p.licensing.termsUrl, `${path}.licensing.termsUrl`, issues);

    if ((p.freeTier.costUsd as number) !== 0) {
      issues.push({ code: "NONZERO_COST", path: `${path}.freeTier`, message: "costUsd must be 0" });
    }
    if (p.auth.kind !== "none" && p.auth.envVars.length === 0) {
      issues.push({ code: "AUTH_MISSING_ENV_VAR", path: `${path}.auth`, message: `${p.auth.kind} auth must name its env vars` });
    }
    for (const v of p.auth.envVars) {
      if (!ENV_VAR.test(v)) issues.push({ code: "BAD_ENV_VAR_NAME", path: `${path}.auth`, message: `bad env var name ${v}` });
    }

    const newest = newestTestedOn(p);
    if (newest !== p.lastSuccessfulValidation) {
      issues.push({
        code: "VALIDATION_DATE_MISMATCH",
        path: `${path}.lastSuccessfulValidation`,
        message: `lastSuccessfulValidation is ${p.lastSuccessfulValidation}, newest TESTED claim is ${newest}`,
      });
    }

    p.series.forEach((s, si) => {
      const spath = `${path}.series[${si}](${s.id})`;
      if (seriesIds.has(s.id)) issues.push({ code: "DUPLICATE_ID", path: spath, message: `duplicate series id ${s.id}` });
      seriesIds.add(s.id);
      validateSeries(s, p, spath, registry.asOf, issues);
    });
  });

  const strings: [string, string][] = [];
  collectStrings(registry, "registry", strings);
  for (const [path, value] of strings) {
    if (SECRET_PATTERNS.some((re) => re.test(value))) {
      issues.push({ code: "POSSIBLE_SECRET", path, message: "string looks like a credential value" });
    }
  }

  return issues;
}

// ── Coverage audit (shape for /quality) ────────────────────────────────────

export interface ProviderCoverageSummary {
  readonly providerId: string;
  readonly name: string;
  readonly category: DataProviderEntry["category"];
  readonly authKind: DataProviderEntry["auth"]["kind"];
  readonly envVars: readonly string[];
  readonly seriesCount: number;
  readonly claims: { readonly tested: number; readonly advertised: number; readonly unavailable: number };
  readonly pointInTime: { readonly eligible: number; readonly conditional: number; readonly ineligible: number };
  readonly storage: Permission;
  readonly redistribution: Permission;
  /** Most mature place code for this provider lives. */
  readonly implementation: "MAIN" | "OPEN_PR" | "NONE";
  readonly lastSuccessfulValidation: IsoDate | null;
  readonly validationAgeDays: number | null;
  readonly stale: boolean;
}

export interface CoverageAudit {
  readonly registryAsOf: IsoDate;
  readonly today: IsoDate;
  readonly staleAfterDays: number;
  readonly providers: readonly ProviderCoverageSummary[];
  readonly totals: ProviderCoverageSummary["claims"] & {
    readonly providers: number;
    readonly series: number;
    readonly staleProviders: number;
  };
  readonly issues: readonly RegistryIssue[];
}

export interface CoverageAuditOptions {
  readonly today: IsoDate;
  /** A provider whose last successful validation is older than this is stale. */
  readonly staleAfterDays?: number;
}

export const DEFAULT_STALE_AFTER_DAYS = 90;

function summarizeProvider(p: DataProviderEntry, today: IsoDate, staleAfterDays: number): ProviderCoverageSummary {
  const claims = { tested: 0, advertised: 0, unavailable: 0 };
  const pointInTime = { eligible: 0, conditional: 0, ineligible: 0 };
  for (const s of p.series) {
    for (const c of s.coverage) {
      if (c.status === "TESTED") claims.tested += 1;
      else if (c.status === "ADVERTISED") claims.advertised += 1;
      else claims.unavailable += 1;
    }
    if (s.pointInTime.status === "ELIGIBLE") pointInTime.eligible += 1;
    else if (s.pointInTime.status === "CONDITIONAL") pointInTime.conditional += 1;
    else pointInTime.ineligible += 1;
  }
  const age = p.lastSuccessfulValidation === null ? null : daysBetween(p.lastSuccessfulValidation, today);
  const implementation = p.implementations.some((i) => i.status === "MAIN")
    ? "MAIN"
    : p.implementations.length > 0
      ? "OPEN_PR"
      : "NONE";
  return {
    providerId: p.id,
    name: p.name,
    category: p.category,
    authKind: p.auth.kind,
    envVars: p.auth.envVars,
    seriesCount: p.series.length,
    claims,
    pointInTime,
    storage: p.licensing.storage,
    redistribution: p.licensing.redistribution,
    implementation,
    lastSuccessfulValidation: p.lastSuccessfulValidation,
    validationAgeDays: age,
    stale: age === null || age > staleAfterDays,
  };
}

export function buildCoverageAudit(registry: DataSourceRegistry, options: CoverageAuditOptions): CoverageAudit {
  const staleAfterDays = options.staleAfterDays ?? DEFAULT_STALE_AFTER_DAYS;
  const providers = registry.providers.map((p) => summarizeProvider(p, options.today, staleAfterDays));
  const totals = providers.reduce(
    (t, p) => ({
      providers: t.providers + 1,
      series: t.series + p.seriesCount,
      tested: t.tested + p.claims.tested,
      advertised: t.advertised + p.claims.advertised,
      unavailable: t.unavailable + p.claims.unavailable,
      staleProviders: t.staleProviders + (p.stale ? 1 : 0),
    }),
    { providers: 0, series: 0, tested: 0, advertised: 0, unavailable: 0, staleProviders: 0 },
  );
  return {
    registryAsOf: registry.asOf,
    today: options.today,
    staleAfterDays,
    providers,
    totals,
    issues: validateRegistry(registry),
  };
}

// ── Range assessment ───────────────────────────────────────────────────────

/**
 * Whether the data could be OBTAINED. This says nothing about whether it is fit
 * for research: TESTED means a request returned bars, not that they are
 * certified, point-in-time safe or licensed for storage. See `suitability`.
 */
export type AvailabilityVerdict = "TESTED" | "ADVERTISED" | "UNAVAILABLE" | "UNKNOWN";

/**
 * Whether obtained data may be used for point-in-time research. Series-level:
 * range-specific limits (for example certified sessions) appear in the
 * point-in-time conditions, which must be satisfied by the caller.
 */
export interface ResearchSuitability {
  readonly pointInTime: PointInTimeEligibility;
  readonly licensing: {
    readonly storage: Permission;
    readonly redistribution: Permission;
    readonly summary: string;
    readonly basis: LicensingTerms["basis"];
  };
  /**
   * Every reason the range is not research-ready as-is: availability other
   * than TESTED, point-in-time status other than ELIGIBLE (each condition is
   * listed), and storage other than PERMITTED. Redistribution is reported in
   * `licensing` but does not block private research.
   */
  readonly blockers: readonly string[];
  /** True only when `blockers` is empty. */
  readonly researchReady: boolean;
}

export interface CoverageAssessment {
  readonly seriesId: string;
  readonly providerId: string | null;
  readonly resolution: Resolution;
  readonly from: IsoDate;
  readonly to: IsoDate;
  readonly availability: AvailabilityVerdict;
  /** Claims that decided `availability`. */
  readonly claims: readonly CoverageClaim[];
  /** Null only when the series is not registered. */
  readonly suitability: ResearchSuitability | null;
}

export interface AssessCoverageOptions {
  readonly today: IsoDate;
  /** Premium tiers are excluded by default: the project budget is $0. */
  readonly includePremium?: boolean;
}

/**
 * The dates a claim spans as of `today`. Rolling windows measured in sessions
 * are converted 1:1 to calendar days, which under-states them, so a range is
 * never reported covered when it might not be.
 */
function claimSpan(claim: CoverageClaim, today: IsoDate): { start: IsoDate | null; end: IsoDate | null } {
  if (claim.rollingWindow) return { start: addDays(today, -claim.rollingWindow.length), end: today };
  // ADVERTISED with no end means "ongoing"; UNAVAILABLE with no end is unbounded.
  const end = claim.end ?? (claim.status === "ADVERTISED" ? today : null);
  return { start: claim.start, end };
}

function spans(claim: CoverageClaim, from: IsoDate, to: IsoDate, today: IsoDate): boolean {
  const { start, end } = claimSpan(claim, today);
  return start !== null && end !== null && start <= from && end >= to;
}

function overlaps(claim: CoverageClaim, from: IsoDate, to: IsoDate, today: IsoDate): boolean {
  const { start, end } = claimSpan(claim, today);
  // An UNAVAILABLE claim with no dates covers every date.
  return (start === null || start <= to) && (end === null || end >= from);
}

function locateSeries(
  registry: DataSourceRegistry,
  seriesId: string,
): { provider: DataProviderEntry; series: DataSeriesEntry } | null {
  for (const provider of registry.providers) {
    const series = provider.series.find((x) => x.id === seriesId);
    if (series) return { provider, series };
  }
  return null;
}

export function findSeries(registry: DataSourceRegistry, seriesId: string): DataSeriesEntry | null {
  return locateSeries(registry, seriesId)?.series ?? null;
}

function assessSuitability(
  provider: DataProviderEntry,
  series: DataSeriesEntry,
  availability: AvailabilityVerdict,
): ResearchSuitability {
  const pit = series.pointInTime;
  const lic = provider.licensing;
  const blockers: string[] = [];
  if (availability !== "TESTED") blockers.push(`Availability is ${availability}, not TESTED.`);
  if (pit.status === "INELIGIBLE") blockers.push(`Point-in-time INELIGIBLE: ${pit.reason}`);
  if (pit.status === "CONDITIONAL") {
    blockers.push(`Point-in-time CONDITIONAL: ${pit.reason}`);
    for (const c of pit.conditions) blockers.push(`Condition: ${c}`);
  }
  if (lic.storage !== "PERMITTED") blockers.push(`Storage is ${lic.storage}: ${lic.summary}`);
  return {
    pointInTime: pit,
    licensing: { storage: lic.storage, redistribution: lic.redistribution, summary: lic.summary, basis: lic.basis },
    blockers,
    researchReady: blockers.length === 0,
  };
}

export function assessCoverage(
  registry: DataSourceRegistry,
  seriesId: string,
  resolution: Resolution,
  range: { readonly from: IsoDate; readonly to: IsoDate },
  options: AssessCoverageOptions,
): CoverageAssessment {
  const { from, to } = range;
  const found = locateSeries(registry, seriesId);
  if (!found) {
    return { seriesId, providerId: null, resolution, from, to, availability: "UNKNOWN", claims: [], suitability: null };
  }
  const { provider, series } = found;
  const result = (availability: AvailabilityVerdict, claims: readonly CoverageClaim[]): CoverageAssessment => ({
    seriesId,
    providerId: provider.id,
    resolution,
    from,
    to,
    availability,
    claims,
    suitability: assessSuitability(provider, series, availability),
  });

  const candidates = series.coverage.filter(
    (c) => c.resolution === resolution && (options.includePremium || c.accessTier !== "premium"),
  );
  const pick = (status: CoverageClaim["status"], test: typeof spans) =>
    candidates.filter((c) => c.status === status && test(c, from, to, options.today));

  const tested = pick("TESTED", spans);
  if (tested.length > 0) return result("TESTED", tested);
  const advertised = pick("ADVERTISED", spans);
  if (advertised.length > 0) return result("ADVERTISED", advertised);
  const unavailable = pick("UNAVAILABLE", overlaps);
  if (unavailable.length > 0) return result("UNAVAILABLE", unavailable);
  return result("UNKNOWN", []);
}
