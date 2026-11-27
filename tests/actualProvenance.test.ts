import { describe, expect, it } from "vitest";
import { qualifyHistoricalActual, qualifyLegacyActual, type HistoricalActual } from "@/services/macro/actualProvenance";
const evidence = { sourceUrl: "https://example.org/archived-release", payloadSha256: "a".repeat(64) };
const actual: HistoricalActual = {
  id: "observation", seriesKey: "series", metricKey: "metric", unit: "percent", provider: "official",
  referencePeriodStart: new Date("2024-01-01Z"), referencePeriodEnd: new Date("2024-01-31Z"), value: 3.1,
  valueKind: "INITIAL_REPORTED", providerRevisionKey: "revision-1", vintageDate: "2024-02-13",
  revisionEvidence: evidence, initialReleaseEvidence: evidence,
  publishedAt: new Date("2024-02-13T13:30:00Z"), publicationDate: "2024-02-13", availableAt: new Date("2024-02-13T13:30:01Z"),
  availabilityQuality: "VERIFIED_INSTANT", availabilityPolicyVersion: "reviewed-source-1", availabilityEvidence: evidence,
  fetchedAt: new Date("2026-11-05T21:00:00Z"), recordedAt: new Date("2026-11-05T21:01:00Z"),
};
const policy = { cutoff: new Date("2024-03-01T12:30:00Z"), recordedThrough: new Date("2026-11-05T22:00:00Z"), knowledgeMode: "PUBLIC_INFORMATION_RECONSTRUCTION" as const };
describe("historical macro provenance gate", () => {
  it("allows later-retrieved, independently evidenced public reconstruction", () => {
    expect(qualifyHistoricalActual(actual, policy).eligible).toBe(true);
  });
  it("does not pretend later retrieval was known to this system at cutoff", () => {
    expect(qualifyHistoricalActual(actual, { ...policy, knowledgeMode: "SYSTEM_REPLAY" }).reasons).toContain("not_known_to_system");
  });
  it.each(["CURRENT_DATABASE", "UNRESOLVED"] as const)("blocks %s even with plausible source fields", valueKind => {
    expect(qualifyHistoricalActual({ ...actual, valueKind }, policy).eligible).toBe(false);
  });
  it("requires separate first-print evidence", () => {
    expect(qualifyHistoricalActual({ ...actual, initialReleaseEvidence: null }, policy).reasons).toContain("missing_initial_release_evidence");
  });
  it("allows an evidenced revision as prior context but never as an initial surprise actual", () => {
    const revision = { ...actual, valueKind: "REVISED_HISTORICAL" as const, initialReleaseEvidence: null };
    expect(qualifyHistoricalActual(revision, policy).eligible).toBe(true);
    expect(qualifyHistoricalActual(revision, { ...policy, requireInitial: true }).reasons).toContain("initial_actual_required");
  });
  it("excludes later revisions and availability exactly at cutoff", () => {
    for (const availableAt of [policy.cutoff, new Date("2024-03-02Z")]) expect(qualifyHistoricalActual({ ...actual, availableAt }, policy).reasons).toContain("not_available_before_cutoff");
  });
  it.each(["revisionEvidence", "availabilityEvidence"] as const)("rejects absent %s", field => {
    expect(qualifyHistoricalActual({ ...actual, [field]: null }, policy).eligible).toBe(false);
  });
  it("does not turn a day-level vintage into exact availability", () => {
    expect(qualifyHistoricalActual({ ...actual, publishedAt: null, availableAt: null, availabilityQuality: "UNRESOLVED" }, policy).eligible).toBe(false);
  });
  it("retains a separately evidenced conservative bound without inventing publication time", () => {
    expect(qualifyHistoricalActual({ ...actual, publishedAt: null, availableAt: new Date("2024-02-14T05:00:00Z"), availabilityQuality: "CONSERVATIVE_DATE_BOUND" }, policy).eligible).toBe(true);
  });
  it("requires a stable revision identity", () => {
    expect(qualifyHistoricalActual({ ...actual, providerRevisionKey: null }, policy).reasons).toContain("missing_revision_evidence");
  });
  it("rejects contradictory publication and availability ordering", () => {
    expect(qualifyHistoricalActual({ ...actual, availableAt: new Date("2024-02-12Z") }, policy).reasons).toContain("invalid_temporal_order");
  });
  it("enforces the data freeze", () => {
    expect(qualifyHistoricalActual(actual, { ...policy, recordedThrough: actual.fetchedAt }).reasons).toContain("recorded_after_data_freeze");
  });
  it("rejects invalid dates and nonfinite numbers", () => {
    expect(qualifyHistoricalActual({ ...actual, availableAt: new Date(NaN), value: NaN }, policy).eligible).toBe(false);
  });
  it("blocks legacy actuals even when finite, preserving descriptive use", () => {
    expect(qualifyLegacyActual(3.1)).toMatchObject({ valueKind: "CURRENT_DATABASE", descriptiveEligible: true, pointInTimeEligible: false });
    expect(qualifyLegacyActual(null).descriptiveEligible).toBe(false);
  });
  it("does not accept token-bearing URLs as archive evidence", () => {
    expect(qualifyHistoricalActual({ ...actual, revisionEvidence: { ...evidence, sourceUrl: "https://example.org/data?api_key=secret" } }, policy).eligible).toBe(false);
  });
});
