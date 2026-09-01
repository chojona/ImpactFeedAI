import { describe, expect, it } from "vitest";

import { feedRows, rankedSummary } from "@/services/events/feedSections";
import type { NewsEvent } from "@/types/events";

/**
 * The two claims a flat grid of cards makes silently: that consecutive cards
 * are comparable, and that a sorted list is sorted all the way down. Both are
 * false in this feed, and every case below is one of the shapes the library
 * actually produces.
 */

const event = (id: string, over: Partial<NewsEvent> = {}): NewsEvent => ({
  id,
  title: `Event ${id}`,
  date: "2025-06-11T12:30:00.000Z",
  occurredAt: "2025-06-11T12:30:00.000Z",
  timing: {
    status: "SCHEDULED",
    releaseAt: "2025-06-11T12:30:00.000Z",
    releaseDate: "2025-06-11",
    source: "BLS release schedule",
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
  ...over,
});

/** An event placed on one US-Eastern day by a sourced release instant. */
const onDay = (id: string, instant: string): NewsEvent =>
  event(id, {
    occurredAt: instant,
    date: instant,
    timing: {
      status: "SCHEDULED",
      releaseAt: instant,
      releaseDate: instant.slice(0, 10),
      source: "BLS release schedule",
      reactionEligible: true,
      ineligibilityReason: null,
    },
  });

/** An event with no defensible date at any level of the ladder. */
const undated = (id: string): NewsEvent =>
  event(id, {
    occurredAt: "not-an-instant",
    timing: {
      status: "UNVERIFIED",
      releaseAt: null,
      releaseDate: null,
      source: null,
      reactionEligible: false,
      ineligibilityReason: "untrusted_status",
    },
  });

const ids = (n: number) => Array.from({ length: n }, (_, i) => event(`e${i}`));

const sectionsOf = (rows: ReturnType<typeof feedRows>) =>
  rows
    .map((row, index) => (row.section === null ? null : { index, ...row.section }))
    .filter((s): s is NonNullable<typeof s> => s !== null);

describe("feedRows — biggest move", () => {
  const biggest = (loaded: number, rankedCount: number, total: number) =>
    feedRows(ids(loaded), { sort: "biggest", rankedCount, total });

  it("marks nothing when every result in the set is ranked", () => {
    expect(sectionsOf(biggest(12, 12, 12))).toEqual([]);
  });

  it("marks the boundary where the ranking stops", () => {
    const marks = sectionsOf(biggest(24, 20, 50));
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({
      index: 20,
      kind: "unranked",
      label: "No measured 1D reaction",
    });
    expect(marks[0]?.detail).toBe("30 events · newest first");
  });

  it("marks the very first card when nothing in the set can be ranked", () => {
    const marks = sectionsOf(biggest(11, 0, 11));
    expect(marks).toHaveLength(1);
    expect(marks[0]?.index).toBe(0);
    expect(marks[0]?.detail).toBe("11 events · newest first");
  });

  /**
   * Pagination is where a boundary marker goes wrong: it must not appear
   * before the reader has actually paged past the ranking, must appear exactly
   * once when they do, and must not move afterwards.
   */
  it("holds the marker back until an unranked event is loaded", () => {
    expect(sectionsOf(biggest(12, 20, 50))).toEqual([]); // page one, all ranked
    expect(sectionsOf(biggest(20, 20, 50))).toEqual([]); // exactly at the edge
    expect(sectionsOf(biggest(21, 20, 50))[0]?.index).toBe(20); // one past it
    expect(sectionsOf(biggest(36, 20, 50))[0]?.index).toBe(20); // and it stays
  });

  it("never emits a second marker as more pages arrive", () => {
    for (const loaded of [21, 24, 36, 48, 50]) {
      expect(sectionsOf(biggest(loaded, 20, 50))).toHaveLength(1);
    }
  });

  it("does not group by date, so the ranking stays the visible order", () => {
    const rows = feedRows(
      [
        onDay("a", "2025-06-11T12:30:00.000Z"),
        onDay("b", "2024-01-10T13:30:00.000Z"),
        onDay("c", "2026-02-24T15:00:00.000Z"),
      ],
      { sort: "biggest", rankedCount: 3, total: 3 },
    );
    expect(sectionsOf(rows)).toEqual([]);
    expect(rows.map((r) => r.event.id)).toEqual(["a", "b", "c"]);
  });

  it("pluralises a single unranked event", () => {
    expect(sectionsOf(biggest(2, 1, 2))[0]?.detail).toBe("1 event · newest first");
  });
});

describe("feedRows — newest", () => {
  const now = new Date("2026-09-01T16:00:00.000Z"); // Sep 1 2026, noon ET

  const grouped = (events: NewsEvent[]) =>
    feedRows(events, { sort: "newest", rankedCount: 0, total: events.length, now });

  it("names today and yesterday, then falls back to months", () => {
    const rows = grouped([
      onDay("today", "2026-09-01T13:30:00.000Z"),
      onDay("yesterday", "2026-08-31T13:30:00.000Z"),
      onDay("older", "2026-08-05T13:30:00.000Z"),
      onDay("older-still", "2026-07-05T13:30:00.000Z"),
    ]);
    expect(sectionsOf(rows).map((s) => s.label)).toEqual([
      "Today",
      "Yesterday",
      "Aug 2026",
      "Jul 2026",
    ]);
  });

  it("emits one heading per group, not one per card", () => {
    const rows = grouped([
      onDay("a", "2025-06-11T13:30:00.000Z"),
      onDay("b", "2025-06-05T13:30:00.000Z"),
      onDay("c", "2025-06-02T13:30:00.000Z"),
      onDay("d", "2025-05-30T13:30:00.000Z"),
    ]);
    const marks = sectionsOf(rows);
    expect(marks.map((s) => [s.index, s.label])).toEqual([
      [0, "Jun 2025"],
      [3, "May 2025"],
    ]);
  });

  /**
   * The heading belongs to the group, not to the page. Appending page two must
   * not restate a month that page one already opened, and must open one for the
   * month that begins mid-page.
   */
  it("keeps groups intact across a page boundary", () => {
    const pageOne = [
      onDay("a", "2025-06-11T13:30:00.000Z"),
      onDay("b", "2025-06-05T13:30:00.000Z"),
    ];
    const pageTwo = [
      onDay("c", "2025-06-01T13:30:00.000Z"),
      onDay("d", "2025-05-28T13:30:00.000Z"),
    ];
    expect(sectionsOf(grouped(pageOne)).map((s) => s.label)).toEqual(["Jun 2025"]);
    const both = sectionsOf(grouped([...pageOne, ...pageTwo]));
    expect(both.map((s) => [s.index, s.label])).toEqual([
      [0, "Jun 2025"],
      [3, "May 2025"],
    ]);
  });

  it("groups an unverified event by its occurrence day, not by a guess", () => {
    // No release timing at all: the ladder falls back to the occurrence date,
    // and the heading has to agree with the date the card itself prints.
    const rows = grouped([
      event("occurred", {
        occurredAt: "2024-10-29T20:00:00.000Z",
        timing: {
          status: "UNVERIFIED",
          releaseAt: null,
          releaseDate: null,
          source: null,
          reactionEligible: false,
          ineligibilityReason: "untrusted_status",
        },
      }),
    ]);
    expect(sectionsOf(rows)[0]?.label).toBe("Oct 2024");
  });

  it("files a row with no date under its own heading rather than a month", () => {
    const rows = grouped([
      onDay("dated", "2025-06-11T13:30:00.000Z"),
      undated("no-date"),
    ]);
    expect(sectionsOf(rows).map((s) => s.label)).toEqual([
      "Jun 2025",
      "Date not recorded",
    ]);
  });

  it("uses the US-Eastern day, matching the date the card renders", () => {
    // 02:00Z on Jun 11 is 22:00 ET on Jun 10.
    const rows = grouped([onDay("late", "2025-06-11T02:00:00.000Z")]);
    expect(sectionsOf(rows)[0]?.label).toBe("Jun 2025");
    expect(rows).toHaveLength(1);
  });

  it("returns one row per event and never drops or reorders one", () => {
    const events = [
      onDay("a", "2025-06-11T13:30:00.000Z"),
      onDay("b", "2025-05-11T13:30:00.000Z"),
      undated("c"),
    ];
    expect(grouped(events).map((r) => r.event.id)).toEqual(["a", "b", "c"]);
  });
});

describe("rankedSummary", () => {
  it("states the ranked and unranked halves separately", () => {
    expect(rankedSummary(20, 50)).toBe(
      "20 events ranked by 1D move · 30 without measured 1D reaction",
    );
  });

  it("drops the second clause when the whole set is ranked", () => {
    expect(rankedSummary(12, 12)).toBe("12 events ranked by 1D move");
  });

  it("still reports zero ranked rather than staying silent", () => {
    expect(rankedSummary(0, 11)).toBe(
      "0 events ranked by 1D move · 11 without measured 1D reaction",
    );
  });

  it("says nothing about an empty result set", () => {
    expect(rankedSummary(0, 0)).toBeNull();
  });
});
