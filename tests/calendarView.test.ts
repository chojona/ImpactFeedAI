import { describe, expect, it } from "vitest";

import {
  DEFAULT_CALENDAR_TAKE,
  compareCalendarEvents,
  effectiveCalendarInstant,
  eventHasMeasuredReaction,
  selectTopCalendarIds,
  sortCalendarEvents,
  type CalendarSortCandidate,
} from "@/services/events/calendarView";
import type {
  AssetReaction,
  MeasuredMove,
  NewsEvent,
  ReactionMeasure,
} from "@/types/events";

const move = (measure: ReactionMeasure, pctChange: number): MeasuredMove => ({
  measure,
  pctChange,
  anchorPrice: 100,
  anchorBarAt: "2025-05-12T13:30:00.000Z",
  anchorSessionDay: "2025-05-12",
  endpointPrice: 100 + pctChange,
  endpointBarAt: "2025-05-13T13:30:00.000Z",
  endpointSessionDay: "2025-05-13",
  releaseSessionDay: "2025-05-13",
  anchorKind:
    measure === "INTRADAY_60M" ? "PRE_RELEASE_INTRADAY_BAR" : "PRIOR_SESSION_CLOSE",
  priceBasis: "SPLIT_ADJUSTED",
});

const asset = (
  symbol: string,
  moves: Partial<Record<ReactionMeasure, number>>,
): AssetReaction => {
  const measures: Partial<Record<ReactionMeasure, MeasuredMove>> = {};
  for (const [measure, pct] of Object.entries(moves) as [
    ReactionMeasure,
    number,
  ][]) {
    measures[measure] = move(measure, pct);
  }
  const headline = measures.RELEASE_SESSION ?? null;
  return {
    symbol,
    name: symbol,
    assetType: "INDEX",
    sessionBasis: "US_EQUITY_RTH",
    measures,
    headlineMeasure: headline === null ? null : "RELEASE_SESSION",
    percentChange: headline?.pctChange ?? null,
    direction: null,
  };
};

const baseEvent = (overrides: Partial<NewsEvent>): NewsEvent => ({
  id: "evt-1",
  title: "Test event",
  date: "2025-06-01T12:00:00.000Z",
  occurredAt: "2025-06-01T12:00:00.000Z",
  timing: {
    status: "VERIFIED",
    releaseAt: "2025-06-01T12:30:00.000Z",
    releaseDate: "2025-06-01",
    source: "BLS schedule",
    reactionEligible: true,
    ineligibilityReason: null,
  },
  eventType: "CPI",
  category: "INFLATION",
  summary: null,
  explanation: null,
  sourceUrl: null,
  release: null,
  releases: [],
  assets: [],
  ...overrides,
});

describe("eventHasMeasuredReaction", () => {
  it("is false when timing is eligible but assets only have non-headline measures", () => {
    const event = baseEvent({
      assets: [asset("SPY", { SESSION_PLUS_5: 1.2 })],
    });
    expect(event.timing.reactionEligible).toBe(true);
    expect(event.assets.length).toBe(1);
    expect(eventHasMeasuredReaction(event)).toBe(false);
  });

  it("is false when assets exist but headline percentChange is null", () => {
    const hollow = asset("SPY", {});
    expect(hollow.percentChange).toBeNull();
    expect(
      eventHasMeasuredReaction(
        baseEvent({ assets: [hollow], timing: {
          status: "VERIFIED",
          releaseAt: "2025-06-01T12:30:00.000Z",
          releaseDate: "2025-06-01",
          source: "BLS schedule",
          reactionEligible: true,
          ineligibilityReason: null,
        }}),
      ),
    ).toBe(false);
  });

  it("is false when a headline move exists but timing is not eligible", () => {
    const event = baseEvent({
      timing: {
        status: "UNVERIFIED",
        releaseAt: "2025-06-01T12:30:00.000Z",
        releaseDate: "2025-06-01",
        source: null,
        reactionEligible: false,
        ineligibilityReason: "untrusted_status",
      },
      assets: [asset("SPY", { RELEASE_SESSION: 0.4 })],
    });
    expect(eventHasMeasuredReaction(event)).toBe(false);
  });

  it("is true for an eligible event with a finite RELEASE_SESSION move", () => {
    const event = baseEvent({
      assets: [asset("SPY", { RELEASE_SESSION: 0.0 })],
    });
    expect(eventHasMeasuredReaction(event)).toBe(true);
  });
});

describe("effectiveCalendarInstant / sortCalendarEvents", () => {
  it("prefers releaseAt over releaseDate and occurredAt", () => {
    const event = baseEvent({
      occurredAt: "2024-01-01T00:00:00.000Z",
      timing: {
        status: "DATE_ONLY",
        releaseAt: "2025-07-03T12:30:00.000Z",
        releaseDate: "2025-01-01",
        source: null,
        reactionEligible: false,
        ineligibilityReason: "untrusted_status",
      },
    });
    expect(effectiveCalendarInstant(event)?.toISOString()).toBe(
      "2025-07-03T12:30:00.000Z",
    );
  });

  it("uses releaseDate at UTC noon when releaseAt is absent", () => {
    const event = baseEvent({
      occurredAt: "2020-01-01T00:00:00.000Z",
      timing: {
        status: "DATE_ONLY",
        releaseAt: null,
        releaseDate: "2025-08-15",
        source: null,
        reactionEligible: false,
        ineligibilityReason: "missing_release_timestamp",
      },
    });
    expect(effectiveCalendarInstant(event)?.toISOString()).toBe(
      "2025-08-15T12:00:00.000Z",
    );
  });

  it("falls back to occurredAt when both release fields are absent", () => {
    const event = baseEvent({
      occurredAt: "2025-03-10T15:00:00.000Z",
      timing: {
        status: "UNVERIFIED",
        releaseAt: null,
        releaseDate: null,
        source: null,
        reactionEligible: false,
        ineligibilityReason: "untrusted_status",
      },
    });
    expect(effectiveCalendarInstant(event)?.toISOString()).toBe(
      "2025-03-10T15:00:00.000Z",
    );
  });

  it("orders mixed releaseAt / releaseDate / occurredAt rows by effective time", () => {
    const byReleaseAt = baseEvent({
      id: "a-release-at",
      timing: {
        status: "VERIFIED",
        releaseAt: "2025-06-01T14:00:00.000Z",
        releaseDate: "2025-06-01",
        source: "BLS",
        reactionEligible: true,
        ineligibilityReason: null,
      },
    });
    const byReleaseDate = baseEvent({
      id: "b-release-date",
      occurredAt: "2019-01-01T00:00:00.000Z",
      timing: {
        status: "DATE_ONLY",
        releaseAt: null,
        releaseDate: "2025-06-10",
        source: null,
        reactionEligible: false,
        ineligibilityReason: "missing_release_timestamp",
      },
    });
    const byOccurred = baseEvent({
      id: "c-occurred",
      occurredAt: "2025-06-20T12:00:00.000Z",
      timing: {
        status: "UNVERIFIED",
        releaseAt: null,
        releaseDate: null,
        source: null,
        reactionEligible: false,
        ineligibilityReason: "untrusted_status",
      },
    });

    // Newest first across the three field families.
    expect(sortCalendarEvents([byReleaseAt, byOccurred, byReleaseDate]).map((e) => e.id)).toEqual([
      "c-occurred",
      "b-release-date",
      "a-release-at",
    ]);
    expect(compareCalendarEvents(byOccurred, byReleaseDate)).toBeLessThan(0);
  });
});

describe("selectTopCalendarIds — page before the library exceeds take", () => {
  /**
   * Builds >DEFAULT_CALENDAR_TAKE mixed-field candidates where lexical id order
   * is the *opposite* of effective-time order. Taking the first 200 by id would
   * keep the oldest rows and drop the newest — the bug `listCalendarEvents`
   * must not reintroduce.
   */
  const buildMixedLibrary = (count: number): CalendarSortCandidate[] => {
    const rows: CalendarSortCandidate[] = [];
    for (let i = 0; i < count; i += 1) {
      const day = String(1 + (i % 28)).padStart(2, "0");
      const month = String(1 + Math.floor(i / 28)).padStart(2, "0");
      // Ascending ids, ascending effective times — oldest first by id.
      const stamp = `2024-${month}-${day}`;
      if (i % 3 === 0) {
        rows.push({
          id: `id-${String(i).padStart(4, "0")}`,
          releaseAt: `${stamp}T14:30:00.000Z`,
          releaseDate: stamp,
          occurredAt: "2020-01-01T00:00:00.000Z",
        });
      } else if (i % 3 === 1) {
        rows.push({
          id: `id-${String(i).padStart(4, "0")}`,
          releaseAt: null,
          releaseDate: stamp,
          occurredAt: "2020-01-01T00:00:00.000Z",
        });
      } else {
        rows.push({
          id: `id-${String(i).padStart(4, "0")}`,
          releaseAt: null,
          releaseDate: null,
          occurredAt: `${stamp}T12:00:00.000Z`,
        });
      }
    }
    return rows;
  };

  it("keeps the newest 200 of 250 mixed-date events, not the first 200 by id", () => {
    const library = buildMixedLibrary(250);
    expect(library.length).toBeGreaterThan(DEFAULT_CALENDAR_TAKE);

    const top = selectTopCalendarIds(library, DEFAULT_CALENDAR_TAKE);
    expect(top).toHaveLength(DEFAULT_CALENDAR_TAKE);

    const byIdPage = library.slice(0, DEFAULT_CALENDAR_TAKE).map((row) => row.id);
    // The naive id+take page is exactly the oldest 200.
    expect(byIdPage[0]).toBe("id-0000");
    expect(byIdPage[byIdPage.length - 1]).toBe("id-0199");

    // Effective-time ranking must prefer the newest ids instead.
    expect(top).toContain("id-0249");
    expect(top).toContain("id-0248");
    expect(top).toContain("id-0200");
    expect(top).not.toContain("id-0000");
    expect(top).not.toContain("id-0049");

    // Newest first.
    expect(top[0]).toBe("id-0249");
    expect(top[top.length - 1]).toBe("id-0050");
  });
});
