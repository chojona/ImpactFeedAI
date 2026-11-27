import { describe, expect, it } from "vitest";

import { alfredDateBoundAvailability } from "@/services/context/availability";
import { CONTEXT_SERIES } from "@/services/context/definitions";
import {
  detectRevisionConflicts,
  selectLatestEconomicObservation,
  selectRevisionForPeriod,
} from "@/services/context/revisionSelect";
import type { ContextObservation, PointInTimePolicy } from "@/types/context";

const seriesKey = CONTEXT_SERIES.PAYEMS.seriesKey;

function obs(
  partial: Partial<ContextObservation> &
    Pick<
      ContextObservation,
      | "id"
      | "observationPeriodStart"
      | "value"
      | "vintageKey"
      | "realtimeStart"
    >,
): ContextObservation {
  const publicationDate = partial.publicationDate ?? partial.realtimeStart;
  const bound = alfredDateBoundAvailability(publicationDate);
  const base: ContextObservation = {
    id: partial.id,
    seriesKey,
    providerSeriesId: "PAYEMS",
    observationPeriodStart: partial.observationPeriodStart,
    value: partial.value,
    rawValue: partial.value === null ? null : String(partial.value),
    unit: "thousands_level",
    vintageKey: partial.vintageKey,
    realtimeStart: partial.realtimeStart,
    realtimeEnd: null,
    vintageDate: publicationDate,
    releaseStage: "REVISION",
    valueKind: "REVISED_HISTORICAL",
    publishedAt: null,
    publicationDate,
    publicationPrecision: bound.publicationPrecision,
    availableAt: bound.availableAt,
    availabilityQuality: bound.availabilityQuality,
    availabilityPolicyVersion: bound.availabilityPolicyVersion,
    quality: "conservative_date_bound",
    fetchedAt: new Date("2026-11-27T15:00:00.000Z"),
    recordedAt: new Date("2026-11-27T15:01:00.000Z"),
    sourceUrl: "https://api.stlouisfed.org/fred/series/observations",
    payloadHash: "a".repeat(64),
    ingestionVersion: "phase-1.1-alfred-point-in-time-1",
  };
  return { ...base, ...partial, publicationDate };
}

const basePolicy: PointInTimePolicy = {
  cutoff: new Date("2023-03-01T13:30:00.000Z"),
  recordedThrough: new Date("2026-11-27T20:00:00.000Z"),
  knowledgeMode: "PUBLIC_INFORMATION_RECONSTRUCTION",
};

describe("point-in-time selection", () => {
  const first = obs({
    id: "payems-jan-v1",
    observationPeriodStart: "2023-01-01",
    value: 155073,
    vintageKey: "PAYEMS:2023-01-01:2023-02-03",
    realtimeStart: "2023-02-03",
    releaseStage: "INITIAL",
    valueKind: "INITIAL_REPORTED",
  });
  const revised = obs({
    id: "payems-jan-v2",
    observationPeriodStart: "2023-01-01",
    value: 155039,
    vintageKey: "PAYEMS:2023-01-01:2023-03-10",
    realtimeStart: "2023-03-10",
  });
  const newerPeriod = obs({
    id: "payems-feb-v1",
    observationPeriodStart: "2023-02-01",
    value: 155200,
    vintageKey: "PAYEMS:2023-02-01:2023-03-10",
    realtimeStart: "2023-03-10",
    releaseStage: "INITIAL",
    valueKind: "INITIAL_REPORTED",
  });

  it("B1: future publication with old period is excluded", () => {
    const future = obs({
      ...revised,
      id: "future",
      availableAt: new Date("2023-04-01T00:00:00.000Z"),
    });
    const result = selectRevisionForPeriod(
      [first, future],
      seriesKey,
      "2023-01-01",
      basePolicy,
    );
    expect(result.status).toBe("selected");
    if (result.status === "selected") {
      expect(result.observation.id).toBe("payems-jan-v1");
    }
  });

  it("B2: appending a later revision does not change an earlier cutoff result", () => {
    const earlyCutoff: PointInTimePolicy = {
      ...basePolicy,
      cutoff: new Date("2023-02-10T13:30:00.000Z"),
    };
    const before = selectRevisionForPeriod(
      [first],
      seriesKey,
      "2023-01-01",
      earlyCutoff,
    );
    const after = selectRevisionForPeriod(
      [first, revised],
      seriesKey,
      "2023-01-01",
      earlyCutoff,
    );
    expect(before).toEqual(after);
    if (after.status === "selected") {
      expect(after.observation.value).toBe(155073);
    }
  });

  it("B3: availableAt == cutoff is excluded (strict <)", () => {
    const atCutoff = obs({
      ...first,
      id: "eq",
      availableAt: basePolicy.cutoff,
    });
    const result = selectRevisionForPeriod(
      [atCutoff],
      seriesKey,
      "2023-01-01",
      basePolicy,
    );
    expect(result.status).toBe("missing");
    if (result.status === "missing") {
      expect(result.reason).toBe("not_available_before_cutoff");
    }
  });

  it("B4: day-only vintage uses conservative NY end-of-day bound", () => {
    const bound = alfredDateBoundAvailability("2023-02-03");
    expect(bound.publishedAt).toBeNull();
    expect(bound.availabilityQuality).toBe("CONSERVATIVE_DATE_BOUND");
    expect(bound.availableAt?.toISOString()).toBe("2023-02-04T05:00:00.000Z");

    const sameDayCutoff: PointInTimePolicy = {
      ...basePolicy,
      cutoff: new Date("2023-02-03T13:30:00.000Z"),
    };
    const result = selectRevisionForPeriod(
      [first],
      seriesKey,
      "2023-01-01",
      sameDayCutoff,
    );
    expect(result.status).toBe("missing");
  });

  it("B5: newer period beats later revision of an older period", () => {
    const latePolicy: PointInTimePolicy = {
      ...basePolicy,
      cutoff: new Date("2023-03-20T13:30:00.000Z"),
    };
    const result = selectLatestEconomicObservation(
      [first, revised, newerPeriod],
      seriesKey,
      latePolicy,
    );
    expect(result.status).toBe("selected");
    if (result.status === "selected") {
      expect(result.observation.observationPeriodStart).toBe("2023-02-01");
    }
  });

  it("B6: conflicting payloads for one vintage key are quarantined", () => {
    const conflictA = obs({
      ...first,
      id: "a",
      payloadHash: "b".repeat(64),
    });
    const conflictB = obs({
      ...first,
      id: "b",
      value: 999999,
      payloadHash: "c".repeat(64),
    });
    const { conflicts, quarantined } = detectRevisionConflicts([
      conflictA,
      conflictB,
    ]);
    expect(conflicts).toHaveLength(1);
    expect(quarantined.every((q) => q.quality === "conflict")).toBe(true);
    const selected = selectRevisionForPeriod(
      [conflictA, conflictB],
      seriesKey,
      "2023-01-01",
      basePolicy,
    );
    expect(selected.status).toBe("missing");
    if (selected.status === "missing") {
      expect(selected.reason).toBe("conflict_quarantined");
    }
  });

  it("B7: system replay rejects later-fetched reconstruction evidence", () => {
    const result = selectRevisionForPeriod([first], seriesKey, "2023-01-01", {
      ...basePolicy,
      knowledgeMode: "SYSTEM_REPLAY",
      cutoff: new Date("2023-02-10T13:30:00.000Z"),
    });
    expect(result.status).toBe("missing");
  });

  it("B7b: reconstruction allows later fetch when availability precedes cutoff", () => {
    const result = selectRevisionForPeriod([first], seriesKey, "2023-01-01", {
      ...basePolicy,
      knowledgeMode: "PUBLIC_INFORMATION_RECONSTRUCTION",
      cutoff: new Date("2023-02-10T13:30:00.000Z"),
    });
    expect(result.status).toBe("selected");
  });

  it("B8: missing stays null-path, never zero", () => {
    const missing = obs({
      id: "missing",
      observationPeriodStart: "2023-01-01",
      value: null,
      vintageKey: "PAYEMS:2023-01-01:2023-02-03",
      realtimeStart: "2023-02-03",
      quality: "missing",
    });
    const result = selectRevisionForPeriod(
      [missing],
      seriesKey,
      "2023-01-01",
      basePolicy,
    );
    expect(result.status).toBe("missing");
    if (result.status === "missing") {
      expect(result.reason).not.toBeUndefined();
    }
  });

  it("A8/D: revised_latest is ineligible by default", () => {
    const current = obs({
      id: "current",
      observationPeriodStart: "2023-01-01",
      value: 154776,
      vintageKey: "PAYEMS:2023-01-01:2026-11-27",
      realtimeStart: "2026-11-27",
      quality: "revised_latest",
      valueKind: "CURRENT_DATABASE",
      availableAt: null,
      availabilityQuality: "UNRESOLVED",
      availabilityPolicyVersion: null,
    });
    const result = selectRevisionForPeriod(
      [current],
      seriesKey,
      "2023-01-01",
      basePolicy,
    );
    expect(result.status).toBe("missing");
    if (result.status === "missing") {
      expect(result.reason).toBe("revised_latest_ineligible");
    }
  });

  it("D1: ALFRED date bound does not mint a verified publication instant", () => {
    expect(first.publishedAt).toBeNull();
    expect(first.publicationPrecision).toBe("date");
  });
});
