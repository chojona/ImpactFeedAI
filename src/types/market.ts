/**
 * Market-data domain types.
 *
 * These mirror the Prisma enums one-for-one, exactly as `src/types/events.ts`
 * mirrors `EventType` and friends. The duplication is deliberate: it keeps pure
 * logic and its tests free of a dependency on generated client code, which is
 * gitignored and absent until `npm run db:generate` has run.
 *
 * Nullability is load-bearing here for the same reason it is in `events.ts`. A
 * candle's `volume` is `number | null` all the way from the provider to the
 * chart, because the provider can and does return a bar with real prices and no
 * usable quantity — see `normalizeProviderVolume`.
 */

/** Mirrors the Prisma `CandleInterval` enum exactly. */
export type CandleInterval =
  | "ONE_MINUTE"
  | "FIVE_MINUTE"
  | "FIFTEEN_MINUTE"
  | "THIRTY_MINUTE"
  | "ONE_HOUR"
  | "ONE_DAY";

/** Mirrors the Prisma `MarketSession` enum exactly. */
export type MarketSession = "REGULAR" | "EXTENDED";

/**
 * Mirrors the Prisma `PriceBasis` enum exactly.
 *
 * Which corporate actions are already baked into a stored price. A series that
 * does not declare this cannot be compared with any other series, because the
 * difference is invisible in the numbers until a corporate action lands between
 * two rows — which is exactly how the XLK/XLE 2:1 split produced a fabricated
 * −50% reaction before the basis guard existed.
 */
export type PriceBasis =
  | "AS_TRADED"
  | "SPLIT_ADJUSTED"
  | "SPLIT_DIVIDEND_ADJUSTED";

/** One persisted OHLCV bar, as the application reads it. */
export interface Candle {
  symbol: string;
  interval: CandleInterval;
  /** Bar OPEN instant, UTC. */
  openTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Null when the provider withheld a quantity. Never coerced to 0. */
  volume: number | null;
  session: MarketSession;
  priceBasis: PriceBasis;
}
