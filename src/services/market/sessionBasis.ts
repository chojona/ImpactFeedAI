/**
 * Declared session structure per instrument.
 *
 * The canonical calendar (`sessionCalendar.ts`) decides WHICH dates a
 * measurement spans; this module records how much tradeable time an
 * instrument actually has inside those dates. Recording it is what stops a
 * cross-asset comparison from implying every SESSION_* value covers the same
 * trading hours — see spec §4.3.
 *
 * Close times below are used for exactly one purpose: resolving the instant at
 * which a daily bar's CLOSING PRICE became known, for the anchor-validity
 * guard in the calculation engine. They are never rendered as precision.
 *
 * Three things are kept conceptually distinct and must not be conflated:
 *
 *   bar timestamp   the provider's stamp. An identifier / bar-open instant.
 *   session day     a label placing the bar on the canonical calendar.
 *   economic close  the instant the bar's close price became known.
 *
 * Collapsing these produced the BTC-USD lookahead defect caught by the
 * Stage-2 dry run: a synthesised 19:00 ET close on the LABELLED day put the
 * anchor 25 hours away from where the price was actually realised, so 57 of
 * 720 session measurements anchored on a post-release price.
 */

import { easternWallClock } from "@/services/macro/time";

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

const DAY_MS = 86_400_000;

export interface EconomicCloseArgs {
  basis: SessionBasis;
  /** Canonical session day label, YYYY-MM-DD. */
  sessionDay: string;
  /** The provider's stamp for this daily bar — an identifier, not a close. */
  barAt: Date;
  isEarlyClose: boolean;
}

/**
 * The instant at which a daily bar's closing price became known.
 *
 * For the session-bounded bases this is a wall-clock time on the bar's own
 * session day, resolved DST-correctly. For a continuous market there is no
 * wall-clock close at all: Yahoo represents BTC-USD as UTC calendar days, so
 * the bar beginning at stamp S closes exactly one UTC day later. That is
 * derived from the BAR, never from the session label — see
 * {@link dailySessionDayFor} in the provider for the matching mapping.
 */
export function economicCloseInstant(args: EconomicCloseArgs): Date {
  switch (args.basis) {
    case "CONTINUOUS_24_7":
      return new Date(args.barAt.getTime() + DAY_MS);
    case "US_EQUITY_RTH": {
      const m = args.isEarlyClose ? EARLY_CLOSE_MINUTE : REGULAR_CLOSE_MINUTE;
      return easternWallClock(args.sessionDay, Math.floor(m / 60), m % 60);
    }
    case "EXTENDED_FUTURES":
      return easternWallClock(
        args.sessionDay,
        Math.floor(FUTURES_CLOSE_MINUTE / 60),
        FUTURES_CLOSE_MINUTE % 60,
      );
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
