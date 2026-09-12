import { describe, expect, it } from "vitest";

import {
  YAHOO_DAILY_BASIS,
  YAHOO_INTRADAY_BASIS,
  dailySessionDayFor,
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

describe("dailySessionDayFor", () => {
  // Yahoo does NOT use one stamping convention for every instrument, so the
  // session day a daily bar belongs to cannot be derived from the stamp alone.
  // Audited over two months of live data (2025-06-01..2025-08-01):
  //   equities   stamped 13:30Z (09:30 ET)  — ET date == UTC date on 42/42 bars
  //   futures    stamped 04:00Z / 13:30Z    — ET date == UTC date on 44..52/52
  //   BTC-USD    stamped 00:00Z             — ET date != UTC date on 62/62
  // The mapping is therefore keyed on the declared SessionBasis.

  it("maps an equity daily bar to its US-Eastern session day", () => {
    expect(dailySessionDayFor("US_EQUITY_RTH", new Date("2025-07-03T13:30:00Z"))).toBe(
      "2025-07-03",
    );
  });

  it("maps a futures daily bar to its US-Eastern session day", () => {
    // Yahoo stamps futures dailies at 04:00Z (00:00 ET) and occasionally at
    // 13:30Z; both land on the same Eastern date.
    expect(dailySessionDayFor("EXTENDED_FUTURES", new Date("2025-07-02T04:00:00Z"))).toBe(
      "2025-07-02",
    );
    expect(dailySessionDayFor("EXTENDED_FUTURES", new Date("2025-07-03T13:30:00Z"))).toBe(
      "2025-07-03",
    );
  });

  it("maps a continuous market's daily bar to its UTC calendar day", () => {
    // THE Stage-2 defect, pinned. A BTC-USD bar stamped 2025-07-03T00:00:00Z
    // represents UTC day 2025-07-03. Converting it to the previous Eastern
    // date (2025-07-02) is what made the NFP anchor a POST-release price.
    expect(dailySessionDayFor("CONTINUOUS_24_7", new Date("2025-07-03T00:00:00Z"))).toBe(
      "2025-07-03",
    );
    expect(dailySessionDayFor("CONTINUOUS_24_7", new Date("2025-07-03T00:00:00Z"))).not.toBe(
      "2025-07-02",
    );
  });

  it("keeps the continuous mapping stable across DST", () => {
    // A UTC-day label has no wall clock to shift, so it is identical in EST
    // and EDT. The Eastern mapping would have shifted by an hour.
    expect(dailySessionDayFor("CONTINUOUS_24_7", new Date("2025-01-15T00:00:00Z"))).toBe(
      "2025-01-15",
    );
    expect(dailySessionDayFor("CONTINUOUS_24_7", new Date("2025-07-15T00:00:00Z"))).toBe(
      "2025-07-15",
    );
  });

  it("does not roll a late-evening UTC stamp into the next Eastern day", () => {
    // 2025-07-03T23:30Z is 19:30 EDT — still July 3 in New York.
    expect(dailySessionDayFor("US_EQUITY_RTH", new Date("2025-07-03T23:30:00Z"))).toBe(
      "2025-07-03",
    );
  });

  it("rolls an early-UTC stamp back into the prior Eastern day for equities", () => {
    // 2025-07-03T02:00Z is 22:00 EDT on July 2. Preserved from the audited
    // Eastern behaviour — only the continuous basis changes.
    expect(dailySessionDayFor("US_EQUITY_RTH", new Date("2025-07-03T02:00:00Z"))).toBe(
      "2025-07-02",
    );
  });
});
