/** Phase 0.5 provenance contract. No legacy DataRelease can prove a vintage.
 * This is an eligibility boundary, not a historical-vintage reconstruction.
 */
export type ActualValueKind = "INITIAL_REPORTED" | "REVISED_HISTORICAL" | "CURRENT_DATABASE" | "UNRESOLVED";
export type AvailabilityQuality = "VERIFIED_INSTANT" | "CONSERVATIVE_DATE_BOUND" | "UNRESOLVED";
export interface EvidenceReference {
  sourceUrl: string;
  payloadSha256: string;
}
/** Proposed append-only observation payload; storage/migration remains gated. */
export interface HistoricalActual {
  readonly id: string;
  readonly seriesKey: string;
  readonly metricKey: string;
  readonly unit: string;
  readonly referencePeriodStart: Date;
  readonly referencePeriodEnd: Date;
  readonly value: number;
  readonly valueKind: ActualValueKind;
  readonly provider: string;
  readonly providerRevisionKey: string | null;
  readonly vintageDate: string | null;
  readonly revisionEvidence: EvidenceReference | null;
  /** Proof of first print is distinct from proof of a historical revision. */
  readonly initialReleaseEvidence: EvidenceReference | null;
  readonly publishedAt: Date | null;
  readonly publicationDate: string | null;
  readonly availableAt: Date | null;
  readonly availabilityQuality: AvailabilityQuality;
  readonly availabilityPolicyVersion: string | null;
  readonly availabilityEvidence: EvidenceReference | null;
  readonly fetchedAt: Date;
  readonly recordedAt: Date;
}
export type ProvenanceRefusal =
  | "missing_identity_or_value" | "invalid_reference_period" | "unqualified_value_kind"
  | "missing_revision_evidence" | "missing_initial_release_evidence"
  | "unverified_availability" | "invalid_temporal_order" | "not_available_before_cutoff"
  | "not_known_to_system" | "recorded_after_data_freeze" | "initial_actual_required";
const validDate = (date: Date | null): date is Date => date instanceof Date && Number.isFinite(date.getTime());
export function isValidEvidenceReference(evidence: EvidenceReference | null): boolean {
  if (!evidence || !/^[a-f0-9]{64}$/i.test(evidence.payloadSha256)) return false;
  try {
    const url = new URL(evidence.sourceUrl);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}

/** Evidence must be independently reviewed before entering this contract.
 * Required fields are necessary conditions, never an automated source audit.
 * A date bound is allowed only when a source reviewer has proved that bound;
 * an ALFRED date alone does not establish any intraday availability.
 */
export function qualifyHistoricalActual(actual: HistoricalActual, policy: {
  cutoff: Date;
  recordedThrough: Date;
  knowledgeMode: "PUBLIC_INFORMATION_RECONSTRUCTION" | "SYSTEM_REPLAY";
  requireInitial?: boolean;
}): { eligible: boolean; reasons: ProvenanceRefusal[]; valueKind: ActualValueKind; availabilityQuality: AvailabilityQuality } {
  const reasons: ProvenanceRefusal[] = [];
  if (![actual.id, actual.seriesKey, actual.metricKey, actual.unit, actual.provider].every(x => x.trim()) || !Number.isFinite(actual.value)) reasons.push("missing_identity_or_value");
  if (!validDate(actual.referencePeriodStart) || !validDate(actual.referencePeriodEnd) || actual.referencePeriodStart.getTime() > actual.referencePeriodEnd.getTime()) reasons.push("invalid_reference_period");
  if (actual.valueKind !== "INITIAL_REPORTED" && actual.valueKind !== "REVISED_HISTORICAL") reasons.push("unqualified_value_kind");
  if (!actual.providerRevisionKey?.trim() || !isValidEvidenceReference(actual.revisionEvidence)) reasons.push("missing_revision_evidence");
  if (actual.valueKind === "INITIAL_REPORTED" && !isValidEvidenceReference(actual.initialReleaseEvidence)) reasons.push("missing_initial_release_evidence");
  if (policy.requireInitial && actual.valueKind !== "INITIAL_REPORTED") reasons.push("initial_actual_required");
  if (!["VERIFIED_INSTANT", "CONSERVATIVE_DATE_BOUND"].includes(actual.availabilityQuality) || !actual.availabilityPolicyVersion?.trim() || !isValidEvidenceReference(actual.availabilityEvidence) || !validDate(actual.availableAt)) reasons.push("unverified_availability");
  if (
    !validDate(policy.cutoff) || !validDate(policy.recordedThrough) ||
    !validDate(actual.fetchedAt) || !validDate(actual.recordedAt) ||
    actual.fetchedAt.getTime() > actual.recordedAt.getTime() ||
    (actual.availabilityQuality === "VERIFIED_INSTANT" && !validDate(actual.publishedAt)) ||
    (actual.publishedAt !== null && (!validDate(actual.publishedAt) || !validDate(actual.availableAt) || actual.publishedAt.getTime() > actual.availableAt.getTime())) ||
    (actual.availabilityQuality === "CONSERVATIVE_DATE_BOUND" && !/^\d{4}-\d{2}-\d{2}$/.test(actual.publicationDate ?? ""))
  ) reasons.push("invalid_temporal_order");
  if (validDate(actual.availableAt) && validDate(policy.cutoff) && actual.availableAt.getTime() >= policy.cutoff.getTime()) reasons.push("not_available_before_cutoff");
  if (validDate(actual.recordedAt) && validDate(policy.recordedThrough) && actual.recordedAt.getTime() > policy.recordedThrough.getTime()) reasons.push("recorded_after_data_freeze");
  if (policy.knowledgeMode === "SYSTEM_REPLAY" && validDate(policy.cutoff) && (!validDate(actual.fetchedAt) || !validDate(actual.recordedAt) || actual.fetchedAt.getTime() >= policy.cutoff.getTime() || actual.recordedAt.getTime() >= policy.cutoff.getTime())) reasons.push("not_known_to_system");
  return { eligible: reasons.length === 0, reasons: [...new Set(reasons)], valueKind: actual.valueKind, availabilityQuality: actual.availabilityQuality };
}

/** Named source/URL and correct-looking numbers cannot recover revision history.
 * Deliberately no inference from headline, Event.createdAt or scheduled time.
 */
export function qualifyLegacyActual(actualValue: number | null) {
  return {
    valueKind: "CURRENT_DATABASE" as const,
    descriptiveEligible: actualValue !== null && Number.isFinite(actualValue),
    pointInTimeEligible: false as const,
    reason: "legacy_actual_has_no_immutable_vintage_or_availability_evidence" as const,
  };
}
