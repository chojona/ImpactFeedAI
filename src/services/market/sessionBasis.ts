/**
 * Declared session structure per instrument.
 *
 * The canonical calendar (`sessionCalendar.ts`) decides WHICH dates a
 * measurement spans; this module records how much tradeable time an
 * instrument actually has inside those dates. Recording it is what stops a
 * cross-asset comparison from implying every SESSION_* value covers the same
 * trading hours — see spec §4.3.
 *
 * Native close times below are DECLARED APPROXIMATIONS used for exactly one
 * purpose: the anchor-validity guard in the calculation engine. They are never
 * used to timestamp a price and are never rendered as precision.
 */

/** Mirrors the Prisma `SessionBasis` enum exactly. */
export type SessionBasis =
  | "US_EQUITY_RTH"
  | "EXTENDED_FUTURES"
  | "CONTINUOUS_24_7";

/**
 * Keep in sync with `ASSET_UNIVERSE` in `scripts/ingest/events-seed.ts` and
 * with `src/lib/assets.ts`. An instrument absent from this table produces no
 * measurements at all — see {@link sessionBasisFor}.
 */
const DECLARED: Readonly<Record<string, SessionBasis>> = {
  SPY: "US_EQUITY_RTH",
  QQQ: "US_EQUITY_RTH",
  IWM: "US_EQUITY_RTH",
  TLT: "US_EQUITY_RTH",
  GLD: "US_EQUITY_RTH",
  XLK: "US_EQUITY_RTH",
  XLF: "US_EQUITY_RTH",
  XLE: "US_EQUITY_RTH",
  "CL=F": "EXTENDED_FUTURES",
  "GC=F": "EXTENDED_FUTURES",
  "DX-Y.NYB": "EXTENDED_FUTURES",
  "BTC-USD": "CONTINUOUS_24_7",
};

/**
 * Null for an undeclared symbol. Callers must produce no measurement rather
 * than defaulting — an unverified session structure is exactly the silent
 * assumption this contract exists to remove.
 */
export const sessionBasisFor = (symbol: string): SessionBasis | null =>
  DECLARED[symbol] ?? null;

const REGULAR_CLOSE_MINUTE = 16 * 60;
const EARLY_CLOSE_MINUTE = 13 * 60;
const FUTURES_CLOSE_MINUTE = 17 * 60;
/**
 * Yahoo stamps BTC-USD daily bars on UTC calendar days, so the bar dated D
 * closes at UTC midnight — 19:00 EST / 20:00 EDT. 19:00 is the conservative
 * (earlier) choice for a strictly-before anchor-validity guard.
 */
const CONTINUOUS_CLOSE_MINUTE = 19 * 60;

/**
 * Minutes past midnight US/Eastern at which this basis stops trading.
 * `isEarlyClose` only affects `US_EQUITY_RTH` — the other bases have no
 * declared early-close schedule.
 */
export function nativeCloseMinuteFor(
  basis: SessionBasis,
  isEarlyClose: boolean,
): number {
  switch (basis) {
    case "US_EQUITY_RTH":
      return isEarlyClose ? EARLY_CLOSE_MINUTE : REGULAR_CLOSE_MINUTE;
    case "EXTENDED_FUTURES":
      return FUTURES_CLOSE_MINUTE;
    case "CONTINUOUS_24_7":
      return CONTINUOUS_CLOSE_MINUTE;
  }
}

/** Terse label for cross-instrument surfaces. Full meaning lives in the Method block. */
export const SESSION_BASIS_BADGE: Readonly<Record<SessionBasis, string>> = {
  US_EQUITY_RTH: "RTH",
  EXTENDED_FUTURES: "FUT",
  CONTINUOUS_24_7: "24/7",
};

export const SESSION_BASIS_MEANING: Readonly<Record<SessionBasis, string>> = {
  US_EQUITY_RTH:
    "US equity regular hours — 09:30–16:00 ET, about 6.5 tradeable hours per session.",
  EXTENDED_FUTURES:
    "Extended futures session — a CME/ICE trading day of roughly 23 hours.",
  CONTINUOUS_24_7:
    "Continuous 24/7 trading — the provider's day is a UTC calendar day.",
};
