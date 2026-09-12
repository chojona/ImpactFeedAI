import { describe, expect, it } from "vitest";

import {
  HEADLINE_MEASURE,
  MEASURE_DESCRIPTIONS,
  MEASURE_LABELS,
  REACTION_MEASURES,
  measureFamily,
  sessionOffsetFor,
} from "@/services/events/reactionMeasures";

describe("reaction measures", () => {
  it("declares exactly the four contracted measures", () => {
    expect(REACTION_MEASURES).toEqual([
      "INTRADAY_60M",
      "RELEASE_SESSION",
      "SESSION_PLUS_1",
      "SESSION_PLUS_5",
    ]);
  });

  it("headlines the release session", () => {
    expect(HEADLINE_MEASURE).toBe("RELEASE_SESSION");
  });

  it("labels SESSION_PLUS_5 as '5 sessions', never 'One week'", () => {
    expect(MEASURE_LABELS.SESSION_PLUS_5).toBe("5 sessions");
    for (const label of Object.values(MEASURE_LABELS)) {
      expect(label).not.toMatch(/one week/i);
    }
  });

  it("splits the measures into two families", () => {
    expect(measureFamily("INTRADAY_60M")).toBe("INTRADAY");
    expect(measureFamily("RELEASE_SESSION")).toBe("SESSION");
    expect(measureFamily("SESSION_PLUS_1")).toBe("SESSION");
    expect(measureFamily("SESSION_PLUS_5")).toBe("SESSION");
  });

  it("maps session measures to their offset and intraday to null", () => {
    expect(sessionOffsetFor("RELEASE_SESSION")).toBe(0);
    expect(sessionOffsetFor("SESSION_PLUS_1")).toBe(1);
    expect(sessionOffsetFor("SESSION_PLUS_5")).toBe(5);
    expect(sessionOffsetFor("INTRADAY_60M")).toBeNull();
  });

  it("gives every measure a label and a description", () => {
    for (const measure of REACTION_MEASURES) {
      expect(MEASURE_LABELS[measure]).toBeTruthy();
      expect(MEASURE_DESCRIPTIONS[measure]).toBeTruthy();
    }
  });
});
