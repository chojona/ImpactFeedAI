/**
 * Exchange and provider semantics for OHLCV candles, as pure functions.
 *
 * Nothing here fetches or stores anything. It encodes what was *measured*
 * against the provider during the candle-storage audit, so the facts that
 * decide whether a candle can be trusted live in one tested place rather than
 * scattered through a script's control flow.
 *
 * Every constant below was probed, not recalled. The probe is
 * `scripts/maintenance/probe-candle-coverage.ts`; re-run it before trusting
 * these numbers again, because they are provider policy and can change without
 * notice.
 *
 * The vocabulary is the shared one from `@/types/market`, so the CLI, the
 * database and this module all say `ONE_HOUR` rather than each keeping a
 * private spelling of the same idea.
 */
import type { CandleInterval, MarketSession } from "@/types/market";

/**
 * Measured maximum lookback per interval, in days. `null` means no practical
 * limit — daily reaches the instrument's first trade date.
 *
 * These are hard server-side errors, not empty responses: Yahoo replies
 * "The requested range must be within the last N days" and the client library
 * throws. A backfill therefore cannot discover the limit by receiving zero
 * bars; it has to know the boundary in advance or handle the throw.
 */
export const INTERVAL_LOOKBACK_DAYS: Readonly<
  Record<CandleInterval, number | null>
> = {
  ONE_MINUTE: 30,
  FIVE_MINUTE: 60,
  FIFTEEN_MINUTE: 60,
  THIRTY_MINUTE: 60,
  ONE_HOUR: 730,
  ONE_DAY: null,
};

/** Minutes covered by one bar of each interval. */
export const INTERVAL_MINUTES: Readonly<Record<CandleInterval, number>> = {
  ONE_MINUTE: 1,
  FIVE_MINUTE: 5,
  FIFTEEN_MINUTE: 15,
  THIRTY_MINUTE: 30,
  ONE_HOUR: 60,
  ONE_DAY: 390,
};

/** Finest interval first — the order a "best available" search should use. */
export const INTERVALS_FINEST_FIRST: readonly CandleInterval[] = [
  "ONE_MINUTE",
  "FIVE_MINUTE",
  "FIFTEEN_MINUTE",
  "THIRTY_MINUTE",
  "ONE_HOUR",
  "ONE_DAY",
];

/** US regular session, in minutes past midnight America/New_York. */
const REGULAR_OPEN_MINUTE = 9 * 60 + 30;
const REGULAR_CLOSE_MINUTE = 16 * 60;

/** Extended session as the provider actually serves it: 04:00–20:00 ET. */
const EXTENDED_OPEN_MINUTE = 4 * 60;
const EXTENDED_CLOSE_MINUTE = 20 * 60;

export const REGULAR_SESSION_MINUTES =
  REGULAR_CLOSE_MINUTE - REGULAR_OPEN_MINUTE;
export const EXTENDED_SESSION_MINUTES =
  EXTENDED_CLOSE_MINUTE - EXTENDED_OPEN_MINUTE;

const newYorkTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Minutes past midnight America/New_York, DST-aware. */
export function newYorkMinuteOfDay(date: Date): number {
  const parts = newYorkTimeFormatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  // Intl renders midnight as hour 24 under some ICU versions; normalise it.
  return (read("hour") % 24) * 60 + read("minute");
}

/**
 * Classify a bar by its **open** timestamp, which is what the provider stamps.
 *
 * A bar opening at 16:00 ET is after the close and therefore extended, even
 * though the 15:00 hourly bar preceding it is regular.
 *
 * ### Known limitation: no exchange calendar
 *
 * Early closes (13:00 ET the day after Thanksgiving, Christmas Eve) and market
 * holidays are **not** modelled — this repository has no exchange calendar and
 * this function deliberately does not invent one. On a half-day the 13:00–16:00
 * bars would be classified REGULAR despite no trading having occurred. In
 * practice the provider returns no bars for those hours, so the
 * misclassification has nothing to attach to; but a provider that emits empty
 * bars would produce REGULAR rows with null volume. That is why the session is
 * *persisted* with each row rather than recomputed at read time: a stored
 * misclassification is auditable and fixable by re-ingestion, whereas one
 * recomputed on every read silently changes when this function does.
 */
export function classifySession(date: Date): MarketSession {
  const minute = newYorkMinuteOfDay(date);
  return minute >= REGULAR_OPEN_MINUTE && minute < REGULAR_CLOSE_MINUTE
    ? "REGULAR"
    : "EXTENDED";
}

/**
 * Normalise a provider volume into a measurement or an explicit unknown.
 *
 * Yahoo returns `volume: 0` on **every** extended-hours intraday bar while
 * still returning real OHLC for it — 124 of 202 bars in the audit probe. SPY
 * plainly does trade pre-market, so that zero is not a measurement of no
 * activity; it is the provider declining to report one. Storing it as 0 would
 * put a fabricated quantity into every volume pane and every VWAP denominator,
 * which is the same class of error as a fabricated 0.00% price move.
 *
 * A regular-session zero is preserved: for an illiquid instrument that is a
 * real, if unusual, observation.
 */
export function normalizeProviderVolume(
  volume: number | null | undefined,
  session: MarketSession,
): number | null {
  if (volume === null || volume === undefined) return null;
  if (!Number.isFinite(volume) || volume < 0) return null;
  if (session === "EXTENDED" && volume === 0) return null;
  return volume;
}

/**
 * Whether the provider can still serve `interval` for an instant.
 *
 * The intraday windows are *rolling*, so this answer decays: an event reachable
 * at ONE_HOUR today becomes permanently unreachable 730 days after it happened.
 * That is the whole argument for persisting candles rather than fetching them
 * on demand — the archive is a one-way ratchet, and every day of delay loses
 * history that cannot be recovered from this provider at any price.
 */
export function intervalReachableAt(
  interval: CandleInterval,
  at: Date,
  now: Date = new Date(),
): boolean {
  const limitDays = INTERVAL_LOOKBACK_DAYS[interval];
  if (limitDays === null) return at.getTime() <= now.getTime();
  const ageDays = (now.getTime() - at.getTime()) / 86_400_000;
  return ageDays >= 0 && ageDays < limitDays;
}

/** The finest interval still reachable for an instant, or null if none is. */
export function finestReachableInterval(
  at: Date,
  now: Date = new Date(),
): CandleInterval | null {
  return (
    INTERVALS_FINEST_FIRST.find((interval) =>
      intervalReachableAt(interval, at, now),
    ) ?? null
  );
}

/** Bars one session yields at an interval, before holidays and half-days. */
export function barsPerSession(
  interval: CandleInterval,
  includeExtended: boolean,
): number {
  if (interval === "ONE_DAY") return 1;
  const minutes = includeExtended
    ? EXTENDED_SESSION_MINUTES
    : REGULAR_SESSION_MINUTES;
  return Math.ceil(minutes / INTERVAL_MINUTES[interval]);
}

export interface RowEstimateInput {
  interval: CandleInterval;
  /** Trading sessions captured per event, including the event session. */
  sessionsPerEvent: number;
  events: number;
  symbols: number;
  includeExtended: boolean;
}

/**
 * Upper-bound row count for a backfill. Deliberately an upper bound: it assumes
 * every session is a full one, so a real run lands under it rather than
 * overrunning an estimate that was quoted as exact.
 */
export function estimateCandleRows({
  interval,
  sessionsPerEvent,
  events,
  symbols,
  includeExtended,
}: RowEstimateInput): number {
  return (
    barsPerSession(interval, includeExtended) *
    sessionsPerEvent *
    events *
    symbols
  );
}
