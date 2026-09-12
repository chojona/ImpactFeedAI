import { describe, expect, it } from "vitest";

import {
  SESSION_BASIS_BADGE,
  SESSION_BASIS_MEANING,
  nativeCloseMinuteFor,
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

describe("nativeCloseMinuteFor", () => {
  it("uses 16:00 ET for equities and 13:00 on an early close", () => {
    expect(nativeCloseMinuteFor("US_EQUITY_RTH", false)).toBe(16 * 60);
    expect(nativeCloseMinuteFor("US_EQUITY_RTH", true)).toBe(13 * 60);
  });

  it("uses declared native closes for the other bases", () => {
    expect(nativeCloseMinuteFor("EXTENDED_FUTURES", false)).toBe(17 * 60);
    expect(nativeCloseMinuteFor("CONTINUOUS_24_7", false)).toBe(19 * 60);
  });

  it("ignores the early-close flag for non-equity bases", () => {
    expect(nativeCloseMinuteFor("EXTENDED_FUTURES", true)).toBe(17 * 60);
    expect(nativeCloseMinuteFor("CONTINUOUS_24_7", true)).toBe(19 * 60);
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
