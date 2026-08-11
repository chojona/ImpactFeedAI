import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchMacroRelease } from "../scripts/ingest/fetch-macro";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("curated consensus provenance", () => {
  const base = {
    eventType: "CPI",
    occurredAt: new Date("2025-05-13T12:30:00Z"),
    releaseAt: new Date("2025-05-13T12:30:00Z"),
    referencePeriodStart: new Date("2025-04-01T00:00:00Z"),
    expectedValue: 2.4,
    metricNameOverride: null,
  };

  it("keeps the existing hand-entered values explicitly unverified", async () => {
    vi.stubEnv("FRED_API_KEY", "");
    const release = await fetchMacroRelease(base);

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

  it("promotes only a sourced snapshot observed before release", async () => {
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
    warning.mockRestore();
  });
});
