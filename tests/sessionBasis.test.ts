import { describe, expect, it } from "vitest";

import {
  SESSION_BASIS_BADGE,
  SESSION_BASIS_MEANING,
  economicCloseInstant,
  sessionBasisFor,
} from "@/services/market/sessionBasis";

describe("sessionBasisFor", () => {
  it("declares the equity ETFs as US regular hours", () => {
    for (const s of ["SPY", "QQQ", "IWM", "TLT", "GLD", "XLK", "XLF", "XLE"]) {
      expect(sessionBasisFor(s)).toBe("US_EQUITY_RTH");
    }
  });

  it("declares the futures instruments as extended", () => {
    for (const s of ["CL=F", "GC=F", "DX-Y.NYB"]) {
      expect(sessionBasisFor(s)).toBe("EXTENDED_FUTURES");
    }
  });

  it("declares bitcoin as continuous", () => {
    expect(sessionBasisFor("BTC-USD")).toBe("CONTINUOUS_24_7");
  });

  it("fails closed for an undeclared symbol", () => {
    // Never defaults to US_EQUITY_RTH: that would assign a session structure
    // nobody verified.
    expect(sessionBasisFor("NVDA")).toBeNull();
    expect(sessionBasisFor("")).toBeNull();
  });
});

describe("economicCloseInstant", () => {
  // The instant a daily bar's CLOSING PRICE became known. Deliberately
  // distinct from the bar's stamp (an identifier / open instant) and from the
  // session day (a label). Conflating the three is what produced the BTC
  // lookahead defect found in the Stage-2 dry run.

  it("uses 16:00 ET for an equity session, and 13:00 ET on an early close", () => {
    expect(
      economicCloseInstant({
        basis: "US_EQUITY_RTH",
        sessionDay: "2025-07-02",
        barAt: new Date("2025-07-02T13:30:00Z"),
        isEarlyClose: false,
      }).toISOString(),
    ).toBe("2025-07-02T20:00:00.000Z");

    expect(
      economicCloseInstant({
        basis: "US_EQUITY_RTH",
        sessionDay: "2025-07-03",
        barAt: new Date("2025-07-03T13:30:00Z"),
        isEarlyClose: true,
      }).toISOString(),
    ).toBe("2025-07-03T17:00:00.000Z");
  });

  it("uses 17:00 ET for futures and ignores the early-close flag", () => {
    const args = {
      basis: "EXTENDED_FUTURES" as const,
      sessionDay: "2025-07-02",
      barAt: new Date("2025-07-02T04:00:00Z"),
    };
    expect(economicCloseInstant({ ...args, isEarlyClose: false }).toISOString()).toBe(
      "2025-07-02T21:00:00.000Z",
    );
    expect(economicCloseInstant({ ...args, isEarlyClose: true }).toISOString()).toBe(
      "2025-07-02T21:00:00.000Z",
    );
  });

  it("derives a continuous market's close from the BAR, one UTC day after its stamp", () => {
    // THE Stage-2 defect, pinned. Yahoo stamps BTC-USD daily bars at UTC
    // midnight and the bar beginning 2025-07-03T00:00Z has its close realized
    // at 2025-07-04T00:00Z. The old model synthesised 19:00 ET on the LABELLED
    // day (2025-07-02T23:00Z) and was wrong by 25 hours.
    expect(
      economicCloseInstant({
        basis: "CONTINUOUS_24_7",
        sessionDay: "2025-07-03",
        barAt: new Date("2025-07-03T00:00:00Z"),
        isEarlyClose: false,
      }).toISOString(),
    ).toBe("2025-07-04T00:00:00.000Z");
  });

  it("derives a continuous close from the bar stamp, never from the session label", () => {
    // Same session label, different bar stamp => different close instant.
    // This is what makes the bar the source of truth rather than the label.
    expect(
      economicCloseInstant({
        basis: "CONTINUOUS_24_7",
        sessionDay: "2025-01-15",
        barAt: new Date("2025-01-15T00:00:00Z"),
        isEarlyClose: true,
      }).toISOString(),
    ).toBe("2025-01-16T00:00:00.000Z");
  });

  it("stays correct across DST boundaries", () => {
    // EST: 16:00 ET is 21:00Z. EDT: 16:00 ET is 20:00Z.
    expect(
      economicCloseInstant({
        basis: "US_EQUITY_RTH",
        sessionDay: "2025-01-15",
        barAt: new Date("2025-01-15T14:30:00Z"),
        isEarlyClose: false,
      }).toISOString(),
    ).toBe("2025-01-15T21:00:00.000Z");

    // A continuous market has no wall-clock close to shift, so its UTC-day
    // close is unaffected by DST in either direction.
    expect(
      economicCloseInstant({
        basis: "CONTINUOUS_24_7",
        sessionDay: "2025-11-02",
        barAt: new Date("2025-11-02T00:00:00Z"),
        isEarlyClose: false,
      }).toISOString(),
    ).toBe("2025-11-03T00:00:00.000Z");
  });
});

describe("badge and meaning", () => {
  it("keeps badges terse and meanings full", () => {
    expect(SESSION_BASIS_BADGE.US_EQUITY_RTH).toBe("RTH");
    expect(SESSION_BASIS_BADGE.EXTENDED_FUTURES).toBe("FUT");
    expect(SESSION_BASIS_BADGE.CONTINUOUS_24_7).toBe("24/7");
    expect(SESSION_BASIS_MEANING.CONTINUOUS_24_7).toMatch(/continuous/i);
    expect(SESSION_BASIS_MEANING.US_EQUITY_RTH).toMatch(/regular hours/i);
    expect(SESSION_BASIS_MEANING.EXTENDED_FUTURES).toMatch(/futures/i);
  });
});
