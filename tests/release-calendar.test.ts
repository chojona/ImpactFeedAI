import { describe, expect, it, vi } from "vitest";

import {
  resolveHistoricalRelease,
  type HistoricalReleaseCalendarProvider,
  type HistoricalReleaseTiming,
  type ReleaseIdentity,
  type ReleaseTimingProvenance,
} from "@/services/macro/release-calendar";
import { easternWallClock } from "@/services/macro/time";

const identity: ReleaseIdentity = {
  metricKey: "CPI_HEADLINE",
  referencePeriodStart: "2024-01-01",
  releaseStage: "INITIAL",
};

const provenance = (
  sourceKind: ReleaseTimingProvenance["sourceKind"],
): ReleaseTimingProvenance => ({
  providerId: "official-test-calendar",
  sourceName: "Official test archive",
  sourceKind,
  sourceUrl: "https://example.gov/releases/2024/cpi.htm",
  retrievedAt: new Date("2026-08-10T12:00:00.000Z"),
});

function provider(
  timing: HistoricalReleaseTiming | null,
): HistoricalReleaseCalendarProvider {
  return {
    id: "official-test-calendar",
    resolve: vi.fn(async () => timing),
  };
}

describe("historical release calendar", () => {
  it("accepts an exact verified instant backed by an official release record", async () => {
    const result = await resolveHistoricalRelease(
      provider({
        timingStatus: "VERIFIED",
        releaseDate: "2024-02-13",
        releaseAt: easternWallClock("2024-02-13", 8, 30),
        provenance: provenance("OFFICIAL_RELEASE_RECORD"),
      }),
      identity,
    );

    expect(result?.identity).toEqual(identity);
    expect(result?.timing.timingStatus).toBe("VERIFIED");
    expect(result?.timing.releaseAt?.toISOString()).toBe(
      "2024-02-13T13:30:00.000Z",
    );
  });

  it("keeps an official scheduled EDT time distinct from verified timing", async () => {
    const result = await resolveHistoricalRelease(
      provider({
        timingStatus: "SCHEDULED",
        releaseDate: "2024-05-14",
        releaseAt: easternWallClock("2024-05-14", 8, 30),
        provenance: provenance("OFFICIAL_SCHEDULE"),
      }),
      { ...identity, referencePeriodStart: "2024-04-01" },
    );

    expect(result?.timing.timingStatus).toBe("SCHEDULED");
    expect(result?.timing.releaseAt?.toISOString()).toBe(
      "2024-05-14T12:30:00.000Z",
    );
  });

  it("returns date-only evidence without manufacturing an instant", async () => {
    const result = await resolveHistoricalRelease(
      provider({
        timingStatus: "DATE_ONLY",
        releaseDate: "2024-02-13",
        releaseAt: null,
        provenance: provenance("OFFICIAL_DATE_METADATA"),
      }),
      identity,
    );

    expect(result?.timing).toMatchObject({
      timingStatus: "DATE_ONLY",
      releaseDate: "2024-02-13",
      releaseAt: null,
    });
  });

  it("preserves an unresolved provider result as null", async () => {
    await expect(resolveHistoricalRelease(provider(null), identity)).resolves.toBeNull();
  });

  it("validates identity before invoking the provider", async () => {
    const calendar = provider(null);

    await expect(
      resolveHistoricalRelease(calendar, {
        ...identity,
        referencePeriodStart: "2024-02-30",
      }),
    ).rejects.toThrow("referencePeriodStart");
    expect(calendar.resolve).not.toHaveBeenCalled();
  });

  it("requires a stable non-empty metric identity", async () => {
    await expect(
      resolveHistoricalRelease(provider(null), { ...identity, metricKey: "" }),
    ).rejects.toThrow("metricKey");
  });

  it("rejects unsupported release stages", async () => {
    await expect(
      resolveHistoricalRelease(provider(null), {
        ...identity,
        releaseStage: "FLASH" as ReleaseIdentity["releaseStage"],
      }),
    ).rejects.toThrow("releaseStage");
  });

  it("rejects missing or mismatched provenance", async () => {
    const wrongProvider = {
      ...provenance("OFFICIAL_SCHEDULE"),
      providerId: "different-provider",
    };
    await expect(
      resolveHistoricalRelease(
        provider({
          timingStatus: "SCHEDULED",
          releaseDate: "2024-02-13",
          releaseAt: easternWallClock("2024-02-13", 8, 30),
          provenance: wrongProvider,
        }),
        identity,
      ),
    ).rejects.toThrow("must match");

    await expect(
      resolveHistoricalRelease(
        provider({
          timingStatus: "DATE_ONLY",
          releaseDate: "2024-02-13",
          releaseAt: null,
          provenance: {
            ...provenance("OFFICIAL_DATE_METADATA"),
            sourceUrl: "http://example.gov/not-secure",
          },
        }),
        identity,
      ),
    ).rejects.toThrow("HTTPS");
  });

  it("requires provenance appropriate to verified versus scheduled timing", async () => {
    await expect(
      resolveHistoricalRelease(
        provider({
          timingStatus: "VERIFIED",
          releaseDate: "2024-02-13",
          releaseAt: easternWallClock("2024-02-13", 8, 30),
          provenance: provenance("OFFICIAL_SCHEDULE"),
        }),
        identity,
      ),
    ).rejects.toThrow("OFFICIAL_RELEASE_RECORD");

    await expect(
      resolveHistoricalRelease(
        provider({
          timingStatus: "SCHEDULED",
          releaseDate: "2024-02-13",
          releaseAt: easternWallClock("2024-02-13", 8, 30),
          provenance: provenance("OFFICIAL_RELEASE_RECORD"),
        }),
        identity,
      ),
    ).rejects.toThrow("OFFICIAL_SCHEDULE");
  });

  it("validates release dates and exact instants", async () => {
    await expect(
      resolveHistoricalRelease(
        provider({
          timingStatus: "DATE_ONLY",
          releaseDate: "2025-02-29",
          releaseAt: null,
          provenance: provenance("OFFICIAL_DATE_METADATA"),
        }),
        identity,
      ),
    ).rejects.toThrow("releaseDate");

    await expect(
      resolveHistoricalRelease(
        provider({
          timingStatus: "VERIFIED",
          releaseDate: "2024-02-13",
          releaseAt: new Date(NaN),
          provenance: provenance("OFFICIAL_RELEASE_RECORD"),
        }),
        identity,
      ),
    ).rejects.toThrow("releaseAt");
  });

  it("checks release-day consistency in America/New_York rather than UTC", async () => {
    const validLateRelease = await resolveHistoricalRelease(
      provider({
        timingStatus: "VERIFIED",
        releaseDate: "2024-05-14",
        // May 15 in UTC, but still May 14 at 20:30 EDT.
        releaseAt: new Date("2024-05-15T00:30:00.000Z"),
        provenance: provenance("OFFICIAL_RELEASE_RECORD"),
      }),
      identity,
    );
    expect(validLateRelease?.timing.releaseDate).toBe("2024-05-14");

    await expect(
      resolveHistoricalRelease(
        provider({
          timingStatus: "VERIFIED",
          releaseDate: "2024-05-14",
          // This instant is May 15 at 00:30 EDT.
          releaseAt: new Date("2024-05-15T04:30:00.000Z"),
          provenance: provenance("OFFICIAL_RELEASE_RECORD"),
        }),
        identity,
      ),
    ).rejects.toThrow("America/New_York");
  });

  it("rejects a runtime attempt to attach an instant to DATE_ONLY evidence", async () => {
    const invalid = {
      timingStatus: "DATE_ONLY",
      releaseDate: "2024-02-13",
      releaseAt: easternWallClock("2024-02-13", 8, 30),
      provenance: provenance("OFFICIAL_DATE_METADATA"),
    } as unknown as HistoricalReleaseTiming;

    await expect(
      resolveHistoricalRelease(provider(invalid), identity),
    ).rejects.toThrow("releaseAt null");
  });
});
