import { describe, expect, it } from "vitest";

import { assessCoverage, buildCoverageAudit, isIsoDate, validateRegistry } from "@/services/sources/audit";
import { DATA_SOURCE_REGISTRY } from "@/services/sources/registry";
import type { DataProviderEntry, DataSeriesEntry, DataSourceRegistry } from "@/types/dataSources";

const TODAY = "2026-11-27";

function series(overrides: Partial<DataSeriesEntry> = {}): DataSeriesEntry {
  return {
    id: "demo:X",
    providerSeriesId: "X",
    title: "X",
    unit: "u",
    canonicalKeys: [],
    coverage: [
      { status: "TESTED", resolution: "1d", accessTier: "anonymous", start: "2020-01-01", end: "2020-12-31", testedOn: "2026-01-01", evidence: "probe" },
    ],
    publication: { delay: "same_day_eod", precision: "date", detail: "d", availabilityRule: null, basis: "TESTED" },
    revisions: { kind: "none", detail: "d", basis: "DOCUMENTED" },
    pointInTime: { status: "CONDITIONAL", reason: "r", conditions: [] },
    notes: [],
    ...overrides,
  };
}

function provider(overrides: Partial<DataProviderEntry> = {}): DataProviderEntry {
  return {
    id: "demo",
    name: "Demo",
    operator: "Demo",
    category: "government_statistics",
    homepage: "https://example.gov",
    auth: { kind: "none", envVars: [], required: false, detail: "" },
    freeTier: { costUsd: 0, limits: [], detail: "" },
    licensing: { storage: "PERMITTED", redistribution: "PERMITTED", attributionRequired: false, summary: "", termsUrl: null, basis: "DOCUMENTED" },
    implementations: [],
    lastSuccessfulValidation: "2026-01-01",
    series: [series()],
    ...overrides,
  };
}

function registry(...providers: DataProviderEntry[]): DataSourceRegistry {
  return { schemaVersion: 1, asOf: TODAY, providers };
}

const codes = (r: DataSourceRegistry) => validateRegistry(r).map((i) => i.code);

describe("validateRegistry", () => {
  it("accepts a well-formed provider", () => {
    expect(codes(registry(provider()))).toEqual([]);
  });

  it("rejects a TESTED claim without a test date", () => {
    const s = series({
      coverage: [{ status: "TESTED", resolution: "1d", accessTier: "anonymous", start: "2020-01-01", end: "2020-12-31", evidence: "x" }],
    });
    expect(codes(registry(provider({ series: [s], lastSuccessfulValidation: null })))).toContain("TESTED_WITHOUT_DATE");
  });

  it("rejects ADVERTISED claims without a citation or carrying a test date", () => {
    const s = series({
      coverage: [
        ...series().coverage,
        { status: "ADVERTISED", resolution: "1m", accessTier: "anonymous", start: "2000-01-01", end: null, testedOn: "2026-01-01", evidence: "docs" },
      ],
    });
    const c = codes(registry(provider({ series: [s] })));
    expect(c).toContain("ADVERTISED_WITHOUT_CITATION");
    expect(c).toContain("DATE_ON_UNTESTED_CLAIM");
  });

  it("rejects UNAVAILABLE claims without a reason or any evidence source", () => {
    const s = series({
      coverage: [...series().coverage, { status: "UNAVAILABLE", resolution: "1m", accessTier: "free_key", start: null, end: null, evidence: "no" }],
    });
    const c = codes(registry(provider({ series: [s] })));
    expect(c).toContain("UNAVAILABLE_WITHOUT_REASON");
    expect(c).toContain("UNAVAILABLE_WITHOUT_EVIDENCE");
  });

  it("rejects inverted ranges, malformed dates and future test dates", () => {
    const s = series({
      coverage: [
        { status: "TESTED", resolution: "1d", accessTier: "anonymous", start: "2021-01-01", end: "2020-01-01", testedOn: "2027-01-01", evidence: "x" },
        { status: "TESTED", resolution: "1w", accessTier: "anonymous", start: "2020-13-01", end: "2020-12-31", testedOn: "2026-01-01", evidence: "x" },
      ],
    });
    const c = codes(registry(provider({ series: [s], lastSuccessfulValidation: "2027-01-01" })));
    expect(c).toEqual(expect.arrayContaining(["INVERTED_RANGE", "TESTED_IN_FUTURE", "BAD_DATE"]));
  });

  it("requires rolling windows to leave fixed dates null", () => {
    const s = series({
      coverage: [{ status: "TESTED", resolution: "1m", accessTier: "anonymous", start: "2026-11-01", end: null, rollingWindow: { length: 30, unit: "days" }, testedOn: "2026-01-01", evidence: "x" }],
    });
    expect(codes(registry(provider({ series: [s] })))).toContain("ROLLING_WITH_FIXED_DATES");
  });

  it("keeps lastSuccessfulValidation equal to the newest TESTED date", () => {
    expect(codes(registry(provider({ lastSuccessfulValidation: "2025-06-01" })))).toEqual(["VALIDATION_DATE_MISMATCH"]);
  });

  it("rejects duplicate ids and series ids that do not match their provider", () => {
    const c = codes(registry(provider(), provider({ series: [series({ id: "other:X" })] })));
    expect(c).toEqual(expect.arrayContaining(["DUPLICATE_ID", "BAD_SERIES_ID"]));
  });

  it("refuses ELIGIBLE point-in-time status for date-only publication timing", () => {
    const dateOnly = series({
      revisions: { kind: "revised_with_vintages", detail: "", basis: "TESTED" },
      pointInTime: { status: "ELIGIBLE", reason: "", conditions: [] },
    });
    expect(series().publication.precision).toBe("date");
    expect(codes(registry(provider({ series: [dateOnly] })))).toContain("PIT_ELIGIBLE_WITHOUT_BASIS");
    const instant = series({
      publication: { ...series().publication, precision: "instant" },
      pointInTime: { status: "ELIGIBLE", reason: "", conditions: [] },
    });
    expect(codes(registry(provider({ series: [instant] })))).toEqual([]);
  });

  it("rejects an UNAVAILABLE claim that overlaps a TESTED claim of the same resolution and tier", () => {
    const tested1m = { status: "TESTED", resolution: "1m", accessTier: "local_licensed", start: "2010-06-07", end: "2026-10-06", testedOn: "2026-01-01", evidence: "manifest" } as const;
    const gap = { status: "UNAVAILABLE", resolution: "1m", accessTier: "local_licensed", start: null, end: null, testedOn: "2026-01-01", unavailableReason: "not_licensed", evidence: "schema" } as const;
    const clash = series({ coverage: [tested1m, gap] });
    expect(codes(registry(provider({ series: [clash] })))).toEqual(["CONTRADICTORY_COVERAGE"]);
    // The same gap at a different resolution, or a refused range outside the tested one, is fine.
    const tick = series({ coverage: [tested1m, { ...gap, resolution: "tick" }] });
    const disjoint = series({ coverage: [tested1m, { ...gap, start: "2000-01-01", end: "2010-06-06" }] });
    expect(codes(registry(provider({ series: [tick] })))).toEqual([]);
    expect(codes(registry(provider({ series: [disjoint] })))).toEqual([]);
  });

  it("refuses ELIGIBLE point-in-time status when revisions are unknown or revised in place", () => {
    const unknown = series({ revisions: { kind: "unknown", detail: "", basis: "UNVERIFIED" }, pointInTime: { status: "ELIGIBLE", reason: "", conditions: [] } });
    const inPlace = series({ revisions: { kind: "revised_without_vintages", detail: "", basis: "DOCUMENTED" }, pointInTime: { status: "ELIGIBLE", reason: "", conditions: [] } });
    expect(codes(registry(provider({ series: [unknown] })))).toContain("PIT_ELIGIBLE_WITHOUT_BASIS");
    expect(codes(registry(provider({ series: [inPlace] })))).toContain("PIT_ELIGIBLE_WITHOUT_BASIS");
  });

  it("requires keyed auth to name env vars, in env-var form", () => {
    const noVars = provider({ auth: { kind: "api_key", envVars: [], required: true, detail: "" } });
    const badVar = provider({ auth: { kind: "api_key", envVars: ["fred-key"], required: true, detail: "" } });
    expect(codes(registry(noVars))).toContain("AUTH_MISSING_ENV_VAR");
    expect(codes(registry(badVar))).toContain("BAD_ENV_VAR_NAME");
  });

  it("flags strings that look like credential values", () => {
    const fakeHex = "0123456789abcdef0123456789abcdef";
    const fakeAv = "AB12CD34EF56GH78";
    for (const detail of [`api_key=${fakeHex.slice(0, 12)}`, `key ${fakeHex}`, `use ${fakeAv}`]) {
      const p = provider({ auth: { kind: "none", envVars: [], required: false, detail } });
      expect(codes(registry(p)), detail).toContain("POSSIBLE_SECRET");
    }
  });

  it("rejects non-https URLs", () => {
    expect(codes(registry(provider({ homepage: "http://example.gov" })))).toContain("NON_HTTPS_URL");
  });
});

describe("assessCoverage", () => {
  const assess = (id: string, res: Parameters<typeof assessCoverage>[2], from: string, to: string, includePremium = false) =>
    assessCoverage(DATA_SOURCE_REGISTRY, id, res, { from, to }, { today: TODAY, includePremium });

  it("reports Alpha Vantage SPY 1-minute 2022 as unavailable on the free key", () => {
    const r = assess("alpha_vantage:SPY", "1m", "2022-03-01", "2022-03-31");
    expect(r.availability).toBe("UNAVAILABLE");
    expect(r.claims.every((c) => c.unavailableReason === "premium_only")).toBe(true);
  });

  it("separates what premium advertises from what the free key gets", () => {
    expect(assess("alpha_vantage:SPY", "1m", "2022-03-01", "2022-03-31", true).availability).toBe("ADVERTISED");
  });

  it("reports Yahoo daily SPY for 2022–2024 as tested", () => {
    expect(assess("yahoo:SPY", "1d", "2022-01-03", "2024-12-31").availability).toBe("TESTED");
  });

  it("evaluates rolling windows relative to today", () => {
    expect(assess("yahoo:SPY", "1m", "2026-11-20", "2026-11-26").availability).toBe("TESTED");
    expect(assess("yahoo:SPY", "1m", "2022-03-01", "2022-03-04").availability).toBe("UNAVAILABLE");
  });

  it("never stretches a session-count window into a covered range", () => {
    // 100 sessions are treated as 100 calendar days, so August 2026 is not claimed.
    expect(assess("alpha_vantage:SPY", "1d", "2026-08-01", "2026-08-31").availability).toBe("UNKNOWN");
  });

  it("reports SF Fed FOMC surprises after 2023 as unpublished", () => {
    const r = assess("sf_fed:fomc_update_2023", "per_event", "2024-01-01", "2024-12-31");
    expect(r.availability).toBe("UNAVAILABLE");
    expect(r.claims[0].unavailableReason).toBe("not_published");
  });

  it("keeps availability separate from research suitability", () => {
    const r = assess("yahoo:SPY", "1d", "2022-01-03", "2024-12-31");
    expect(r.availability).toBe("TESTED");
    expect(r.providerId).toBe("yahoo");
    expect(r.suitability?.researchReady).toBe(false);
    expect(r.suitability?.pointInTime.status).toBe("CONDITIONAL");
    expect(r.suitability?.licensing.storage).toBe("RESTRICTED");
    expect(r.suitability?.blockers.some((b) => b.startsWith("Storage is RESTRICTED"))).toBe(true);
  });

  it("does not treat tested NQ minute bars as certified outside accepted sessions", () => {
    const r = assess("nq_archive:nq_outright_ohlcv_1m", "1m", "2022-01-03", "2022-12-30");
    expect(r.availability).toBe("TESTED");
    expect(r.suitability?.researchReady).toBe(false);
    expect(r.suitability?.blockers).toContain("Condition: Strict measurements only on ACCEPT sessions (accepted-sessions.csv).");
  });

  it("lists every point-in-time condition for ALFRED vintages as a blocker", () => {
    const r = assess("alfred:PAYEMS", "per_vintage", "2022-03-04", "2022-03-04");
    expect(r.availability).toBe("TESTED");
    expect(r.suitability?.researchReady).toBe(false);
    for (const c of r.suitability!.pointInTime.conditions) expect(r.suitability?.blockers).toContain(`Condition: ${c}`);
  });

  it("is research-ready only when tested, point-in-time ELIGIBLE and storable", () => {
    for (const p of DATA_SOURCE_REGISTRY.providers) {
      for (const s of p.series) {
        for (const c of s.coverage.filter((x) => x.status === "TESTED" && x.start && x.end)) {
          const r = assessCoverage(DATA_SOURCE_REGISTRY, s.id, c.resolution, { from: c.start!, to: c.end! }, { today: TODAY });
          expect(r.availability, s.id).toBe("TESTED");
          expect(r.suitability?.researchReady, s.id).toBe(s.pointInTime.status === "ELIGIBLE" && p.licensing.storage === "PERMITTED");
        }
      }
    }
  });

  it("returns UNKNOWN for unregistered series or resolutions", () => {
    const missing = assess("nope:X", "1d", "2022-01-01", "2022-01-02");
    expect(missing.availability).toBe("UNKNOWN");
    expect(missing.suitability).toBeNull();
    expect(assess("cboe:VIX", "1w", "2022-01-01", "2022-01-31").availability).toBe("UNKNOWN");
  });
});

describe("buildCoverageAudit", () => {
  it("totals per-provider counts and reports no issues for the shipped registry", () => {
    const audit = buildCoverageAudit(DATA_SOURCE_REGISTRY, { today: TODAY });
    const sum = (k: "tested" | "advertised" | "unavailable") => audit.providers.reduce((n, p) => n + p.claims[k], 0);
    expect(audit.totals.providers).toBe(14);
    expect(audit.totals.tested).toBe(sum("tested"));
    expect(audit.totals.unavailable).toBe(sum("unavailable"));
    // Advertised-only providers (no live probe yet) count as stale.
    expect(audit.totals.staleProviders).toBe(
      audit.providers.filter((p) => p.lastSuccessfulValidation === null).length,
    );
    expect(audit.issues).toEqual([]);
  });

  it("marks providers stale once validation ages past the threshold", () => {
    const audit = buildCoverageAudit(DATA_SOURCE_REGISTRY, { today: "2027-06-01", staleAfterDays: 90 });
    expect(audit.providers.every((p) => p.stale)).toBe(true);
    const probed = audit.providers.find((p) => p.lastSuccessfulValidation !== null)!;
    expect(probed.validationAgeDays).toBe(186);
  });

  it("reports the most mature implementation status", () => {
    const audit = buildCoverageAudit(DATA_SOURCE_REGISTRY, { today: TODAY });
    const byId = Object.fromEntries(audit.providers.map((p) => [p.providerId, p.implementation]));
    expect(byId).toMatchObject({
      fred: "MAIN",
      cboe: "MAIN",
      nq_archive: "MAIN",
      alpha_vantage: "NONE",
      sf_fed: "MAIN",
      bea: "MAIN",
      federal_reserve_board: "MAIN",
      atlanta_fed: "MAIN",
      philadelphia_fed: "MAIN",
    });
  });
});

describe("isIsoDate", () => {
  it("accepts real calendar dates only", () => {
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2023-02-29")).toBe(false);
    expect(isIsoDate("2024-2-1")).toBe(false);
  });
});
