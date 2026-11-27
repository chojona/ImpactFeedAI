import { describe, expect, it } from "vitest";

import {
  PRESERVATION_WINDOW_DAYS_EACH_SIDE,
  assessWindowCoverage,
  buildEventWindows,
  buildPreservationPlan,
  daysRemainingUntilLookbackCliff,
  eventWindowBounds,
  expectedCriticalOpenTimes,
  expectedRegularOpenTimesForSession,
  rankWindowsApproachingLoss,
} from "../scripts/ingest/candle-preservation-plan";
import { INTERVAL_LOOKBACK_DAYS } from "../scripts/ingest/candle-semantics";
import { buildSessionCalendar } from "@/services/market/sessionCalendar";

const DAY_MS = 86_400_000;

/** Week containing the 2025-07-03 early close; 2025-07-04 holiday omitted. */
const JULY_WEEK = [
  "2025-06-30",
  "2025-07-01",
  "2025-07-02",
  "2025-07-03",
  "2025-07-07",
] as const;

const julyCalendar = buildSessionCalendar([...JULY_WEEK]);

describe("daysRemainingUntilLookbackCliff", () => {
  it("returns null for daily (no practical cliff)", () => {
    const now = new Date("2025-06-01T12:00:00.000Z");
    const releaseAt = new Date("2020-01-01T12:00:00.000Z");
    expect(daysRemainingUntilLookbackCliff("ONE_DAY", releaseAt, now)).toBeNull();
  });

  it("matches lookback minus age for hourly", () => {
    const now = new Date("2025-06-01T00:00:00.000Z");
    const releaseAt = new Date(now.getTime() - 700 * DAY_MS);
    const remaining = daysRemainingUntilLookbackCliff(
      "ONE_HOUR",
      releaseAt,
      now,
    );
    expect(remaining).not.toBeNull();
    expect(remaining!).toBeCloseTo(
      (INTERVAL_LOOKBACK_DAYS.ONE_HOUR as number) - 700,
      5,
    );
  });

  it("goes negative once past the cliff", () => {
    const now = new Date("2025-06-01T00:00:00.000Z");
    const releaseAt = new Date(now.getTime() - 800 * DAY_MS);
    const remaining = daysRemainingUntilLookbackCliff(
      "ONE_HOUR",
      releaseAt,
      now,
    );
    expect(remaining!).toBeLessThan(0);
  });
});

describe("rankWindowsApproachingLoss", () => {
  it("orders oldest-at-risk first and drops unreachable", () => {
    const now = new Date("2025-06-01T00:00:00.000Z");
    const events = [
      { id: "new", releaseAt: new Date(now.getTime() - 10 * DAY_MS) },
      { id: "old-risk", releaseAt: new Date(now.getTime() - 720 * DAY_MS) },
      { id: "gone", releaseAt: new Date(now.getTime() - 800 * DAY_MS) },
      { id: "mid", releaseAt: new Date(now.getTime() - 100 * DAY_MS) },
    ];
    const windows = buildEventWindows(events, "ONE_HOUR", now, 30);
    const ranked = rankWindowsApproachingLoss(windows);

    expect(ranked.map((w) => w.eventId)).toEqual(["old-risk", "mid", "new"]);
    expect(ranked[0]?.approachingLoss).toBe(true);
    expect(windows.find((w) => w.eventId === "gone")?.reachable).toBe(false);
  });
});

describe("expected timestamp grid", () => {
  it("emits seven hourly opens on a regular session and four on an early close", () => {
    const regular = expectedRegularOpenTimesForSession(
      "2025-07-01",
      "ONE_HOUR",
      julyCalendar,
    );
    const early = expectedRegularOpenTimesForSession(
      "2025-07-03",
      "ONE_HOUR",
      julyCalendar,
    );

    expect(regular.status).toBe("ok");
    expect(early.status).toBe("ok");
    if (regular.status !== "ok" || early.status !== "ok") return;

    expect(regular.openTimes).toHaveLength(7);
    expect(early.openTimes).toHaveLength(4);
    expect(regular.openTimes[0]?.toISOString()).toBe("2025-07-01T13:30:00.000Z");
    expect(regular.openTimes.at(-1)?.toISOString()).toBe(
      "2025-07-01T19:30:00.000Z",
    );
    expect(early.openTimes.at(-1)?.toISOString()).toBe(
      "2025-07-03T16:30:00.000Z",
    );
  });

  it("skips weekends and holidays when building the release-window grid", () => {
    // Release Thursday 2025-07-03 08:30 ET (early-close day). ±2 days covers
    // Tue–Sat calendar span; Fri 07-04 is holiday and weekend days are absent.
    const releaseAt = new Date("2025-07-03T12:30:00.000Z");
    const { from, to } = eventWindowBounds(releaseAt);
    const grid = expectedCriticalOpenTimes({
      calendar: julyCalendar,
      interval: "ONE_HOUR",
      from,
      to,
    });

    expect(grid.status).toBe("ok");
    if (grid.status !== "ok") return;

    const days = [
      ...new Set(grid.openTimes.map((d) => d.toISOString().slice(0, 10))),
    ].sort();
    expect(days).toEqual([
      "2025-07-01",
      "2025-07-02",
      "2025-07-03",
      // 2025-07-04 holiday omitted; 07-05/06 weekend omitted
    ]);
    // 7 + 7 + 4 early-close hours
    expect(grid.openTimes).toHaveLength(18);
  });
});

describe("incremental skip-when-covered", () => {
  it("skips only when every expected openTime is stored", () => {
    const now = new Date("2025-07-10T00:00:00.000Z");
    const releaseAt = new Date("2025-07-03T12:30:00.000Z");
    const { from, to } = eventWindowBounds(releaseAt);
    const grid = expectedCriticalOpenTimes({
      calendar: julyCalendar,
      interval: "ONE_HOUR",
      from,
      to,
    });
    expect(grid.status).toBe("ok");
    if (grid.status !== "ok") return;

    const plan = buildPreservationPlan({
      events: [{ id: "e1", releaseAt }],
      symbols: ["SPY", "QQQ"],
      interval: "ONE_HOUR",
      calendar: julyCalendar,
      now,
      coverageFor: ({ symbol }) => ({
        symbol,
        interval: "ONE_HOUR",
        storedOpenTimes: symbol === "SPY" ? grid.openTimes : [],
      }),
    });

    expect(plan.units).toHaveLength(2);
    expect(plan.skippedFullyCovered).toBe(1);
    expect(plan.remaining).toHaveLength(1);
    expect(plan.remaining[0]?.symbol).toBe("QQQ");
    expect(plan.remaining[0]?.estimatedRowsUpperBound).toBeGreaterThan(0);
    expect(plan.units.find((u) => u.symbol === "SPY")?.skippedFullyCovered).toBe(
      true,
    );
  });

  it("does not skip when the bar count matches but a critical timestamp is missing", () => {
    const now = new Date("2025-07-10T00:00:00.000Z");
    const releaseAt = new Date("2025-07-03T12:30:00.000Z");
    const { from, to } = eventWindowBounds(releaseAt);
    const grid = expectedCriticalOpenTimes({
      calendar: julyCalendar,
      interval: "ONE_HOUR",
      from,
      to,
    });
    expect(grid.status).toBe("ok");
    if (grid.status !== "ok") return;

    // Same length as the expected grid, but replace the first critical stamp
    // with an extended-hours decoy that is not on the regular-session grid.
    const decoy = new Date("2025-07-01T08:00:00.000Z"); // 04:00 ET
    const equalCountWrongTimes = [decoy, ...grid.openTimes.slice(1)];
    expect(equalCountWrongTimes).toHaveLength(grid.openTimes.length);

    const assessment = assessWindowCoverage({
      calendar: julyCalendar,
      interval: "ONE_HOUR",
      from,
      to,
      storedOpenTimes: equalCountWrongTimes,
    });
    expect(assessment.storedCount).toBe(grid.openTimes.length);
    expect(assessment.fullyCovered).toBe(false);
    expect(assessment.missingOpenTimes).toHaveLength(1);
    expect(assessment.missingOpenTimes[0]?.toISOString()).toBe(
      grid.openTimes[0]?.toISOString(),
    );

    const plan = buildPreservationPlan({
      events: [{ id: "e1", releaseAt }],
      symbols: ["SPY"],
      interval: "ONE_HOUR",
      calendar: julyCalendar,
      now,
      coverageFor: () => ({
        symbol: "SPY",
        interval: "ONE_HOUR",
        storedOpenTimes: equalCountWrongTimes,
      }),
    });

    expect(plan.skippedFullyCovered).toBe(0);
    expect(plan.remaining).toHaveLength(1);
    expect(plan.remaining[0]?.missingCriticalCount).toBe(1);
  });

  it("does not skip when only part of the release window is stored", () => {
    const now = new Date("2025-07-10T00:00:00.000Z");
    const releaseAt = new Date("2025-07-03T12:30:00.000Z");
    const { from, to } = eventWindowBounds(releaseAt);
    const grid = expectedCriticalOpenTimes({
      calendar: julyCalendar,
      interval: "ONE_HOUR",
      from,
      to,
    });
    expect(grid.status).toBe("ok");
    if (grid.status !== "ok") return;

    // Only the early-close release day is present; prior sessions in ±2 days
    // are missing even if we pad the count with duplicates of that day.
    const releaseDayOnly = grid.openTimes.filter((d) =>
      d.toISOString().startsWith("2025-07-03"),
    );
    expect(releaseDayOnly.length).toBe(4);

    const padded = [
      ...releaseDayOnly,
      ...releaseDayOnly,
      ...releaseDayOnly,
      ...releaseDayOnly,
      ...releaseDayOnly,
    ].slice(0, grid.openTimes.length);
    expect(padded).toHaveLength(grid.openTimes.length);

    const assessment = assessWindowCoverage({
      calendar: julyCalendar,
      interval: "ONE_HOUR",
      from,
      to,
      storedOpenTimes: padded,
    });
    expect(assessment.fullyCovered).toBe(false);
    expect(assessment.missingOpenTimes.length).toBeGreaterThan(0);
    // Count matches the expected grid size — still incomplete coverage.
    expect(padded.length).toBe(grid.openTimes.length);

    const plan = buildPreservationPlan({
      events: [{ id: "e1", releaseAt }],
      symbols: ["SPY"],
      interval: "ONE_HOUR",
      calendar: julyCalendar,
      now,
      coverageFor: () => ({
        symbol: "SPY",
        interval: "ONE_HOUR",
        storedOpenTimes: padded,
      }),
    });

    expect(plan.skippedFullyCovered).toBe(0);
    expect(plan.remaining[0]?.missingCriticalCount).toBeGreaterThan(0);
  });

  it("re-planning with the same coverage yields the same remaining work", () => {
    const now = new Date("2025-07-10T00:00:00.000Z");
    const releaseAt = new Date("2025-07-01T12:30:00.000Z");
    const input = {
      events: [{ id: "e1", releaseAt }],
      symbols: ["SPY"],
      interval: "ONE_HOUR" as const,
      calendar: julyCalendar,
      now,
      coverageFor: () => ({
        symbol: "SPY",
        interval: "ONE_HOUR" as const,
        storedOpenTimes: [] as Date[],
      }),
    };

    const first = buildPreservationPlan(input);
    const second = buildPreservationPlan(input);

    expect(second.remaining).toEqual(first.remaining);
    expect(second.estimatedRowsUpperBound).toBe(first.estimatedRowsUpperBound);
  });

  it("uses the shared ± window width", () => {
    expect(PRESERVATION_WINDOW_DAYS_EACH_SIDE).toBe(2);
    const releaseAt = new Date("2025-01-15T13:30:00.000Z");
    const { from, to } = eventWindowBounds(releaseAt);
    expect(to.getTime() - from.getTime()).toBe(4 * DAY_MS);
  });
});
