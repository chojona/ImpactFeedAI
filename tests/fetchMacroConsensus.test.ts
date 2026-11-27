import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchMacroRelease,
  forecastBasisAllowsSurprise,
} from "../scripts/ingest/fetch-macro";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("curated consensus provenance", () => {
  const base = {
    eventType: "CPI",
    occurredAt: new Date("2025-05-13T12:30:00Z"),
    releaseAt: new Date("2025-05-13T12:30:00Z"),
    referencePeriodStart: new Date("2025-04-01T00:00:00Z"),
    expectedValue: 2.4,
    metricNameOverride: null,
    expectedSeasonalAdjustment: "NSA" as const,
  };

  it("keeps the existing hand-entered values explicitly unverified", async () => {
    vi.stubEnv("FRED_API_KEY", "");
    const release = await fetchMacroRelease({
      ...base,
      expectedSeasonalAdjustment: null,
    });

    expect(release).toMatchObject({
      expectedValue: 2.4,
      actualValue: null,
      consensusStatus: "UNVERIFIED",
      consensusSource: "Curated seed (citation not recorded)",
      consensusSourceUrl: null,
      consensusAsOf: null,
      surpriseMagnitude: null,
    });
  });

  it("promotes only a sourced snapshot observed before release with matching basis", async () => {
    vi.stubEnv("FRED_API_KEY", "");
    const release = await fetchMacroRelease({
      ...base,
      consensusSource: "Licensed survey archive",
      consensusSourceUrl: "https://example.test/archive/cpi-2025-04",
      consensusAsOf: new Date("2025-05-13T12:00:00Z"),
    });

    expect(release).toMatchObject({
      consensusStatus: "VERIFIED",
      consensusSource: "Licensed survey archive",
      consensusSourceUrl: "https://example.test/archive/cpi-2025-04",
      consensusAsOf: new Date("2025-05-13T12:00:00Z"),
    });
  });

  it("rejects look-ahead metadata and leaves the value unverified", async () => {
    vi.stubEnv("FRED_API_KEY", "");
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const release = await fetchMacroRelease({
      ...base,
      consensusSource: "Licensed survey archive",
      consensusSourceUrl: "https://example.test/archive/cpi-2025-04",
      consensusAsOf: new Date("2025-05-13T12:31:00Z"),
    });

    expect(release?.consensusStatus).toBe("UNVERIFIED");
    expect(warning).toHaveBeenCalledWith(
      expect.stringMatching(/consensus provenance rejected/i),
    );
  });

  it("does not VERIFIED-surprise an SA forecast against an NSA PPI actual (review #1)", async () => {
    vi.stubEnv("FRED_API_KEY", "test-key");
    // 13 months of index levels so YoY at Mar-2024 is derivable (~2.1%).
    const observations = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(Date.UTC(2023, 2, 1));
      d.setUTCMonth(d.getUTCMonth() + i);
      const iso = d.toISOString().slice(0, 10);
      // Grow so Mar-2024 vs Mar-2023 ≈ +2.1%.
      const value = iso.startsWith("2023-03")
        ? 100
        : iso.startsWith("2024-03")
          ? 102.1
          : 100 + i * 0.1;
      return { date: iso, value: String(value) };
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ observations }),
      })),
    );

    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const release = await fetchMacroRelease({
      eventType: "PPI",
      occurredAt: new Date("2024-04-11T12:30:00Z"),
      releaseAt: new Date("2024-04-11T12:30:00Z"),
      referencePeriodStart: new Date("2024-03-01T00:00:00Z"),
      expectedValue: 2.2,
      metricNameOverride: null,
      consensusSource: "Licensed survey archive",
      consensusSourceUrl: "https://example.test/archive/ppi-2024-03",
      consensusAsOf: new Date("2024-04-11T12:00:00Z"),
      // SA forecast vs NSA PPIFID actual — must not verify a surprise.
      expectedSeasonalAdjustment: "SA",
    });

    expect(forecastBasisAllowsSurprise("NSA", "SA")).toBe(false);
    expect(forecastBasisAllowsSurprise("NSA", null)).toBe(false);
    expect(forecastBasisAllowsSurprise("NSA", undefined)).toBe(false);
    expect(release?.actualValue).not.toBeNull();
    expect(release?.consensusStatus).toBe("UNVERIFIED");
    expect(release?.surpriseMagnitude).toBeNull();
    expect(warning).toHaveBeenCalledWith(
      expect.stringMatching(/consensus basis rejected/i),
    );
  });

  it("allows a verified surprise when the forecast basis matches the metric", async () => {
    vi.stubEnv("FRED_API_KEY", "test-key");
    const observations = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(Date.UTC(2023, 2, 1));
      d.setUTCMonth(d.getUTCMonth() + i);
      const iso = d.toISOString().slice(0, 10);
      const value = iso.startsWith("2023-03")
        ? 100
        : iso.startsWith("2024-03")
          ? 102.1
          : 100 + i * 0.1;
      return { date: iso, value: String(value) };
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ observations }),
      })),
    );

    const release = await fetchMacroRelease({
      eventType: "PPI",
      occurredAt: new Date("2024-04-11T12:30:00Z"),
      releaseAt: new Date("2024-04-11T12:30:00Z"),
      referencePeriodStart: new Date("2024-03-01T00:00:00Z"),
      expectedValue: 2.2,
      metricNameOverride: null,
      consensusSource: "Licensed survey archive",
      consensusSourceUrl: "https://example.test/archive/ppi-2024-03",
      consensusAsOf: new Date("2024-04-11T12:00:00Z"),
      expectedSeasonalAdjustment: "NSA",
    });

    expect(release?.consensusStatus).toBe("VERIFIED");
    expect(release?.surpriseMagnitude).not.toBeNull();
  });
});
