import { describe, expect, it } from "vitest";

import {
  compareCalendarEvents,
  effectiveCalendarInstant,
  eventHasMeasuredReaction,
  sortCalendarEvents,
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
