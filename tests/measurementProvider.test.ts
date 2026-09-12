import { describe, expect, it } from "vitest";

import {
  YAHOO_DAILY_BASIS,
  YAHOO_INTRADAY_BASIS,
  toSessionDay,
} from "../scripts/ingest/measurement-provider";

describe("provider basis declaration", () => {
  it("declares the two Yahoo series bases, which differ", () => {
    // Measured, not assumed: daily OHLC is split-adjusted, intraday is
    // as-traded. Each measure uses exactly one series, so no row mixes them.
    expect(YAHOO_DAILY_BASIS).toBe("SPLIT_ADJUSTED");
    expect(YAHOO_INTRADAY_BASIS).toBe("AS_TRADED");
    expect(YAHOO_DAILY_BASIS).not.toBe(YAHOO_INTRADAY_BASIS);
  });
});

describe("toSessionDay", () => {
  it("maps a daily bar stamp to its US-Eastern session day", () => {
    expect(toSessionDay(new Date("2025-07-03T13:30:00Z"))).toBe("2025-07-03");
  });

  it("does not roll a late-evening UTC stamp into the next Eastern day", () => {
    // 2025-07-03T23:30Z is 19:30 EDT — still July 3 in New York.
    expect(toSessionDay(new Date("2025-07-03T23:30:00Z"))).toBe("2025-07-03");
  });

  it("rolls an early-UTC stamp back into the prior Eastern day", () => {
    // 2025-07-03T02:00Z is 22:00 EDT on July 2.
    expect(toSessionDay(new Date("2025-07-03T02:00:00Z"))).toBe("2025-07-02");
  });
});
