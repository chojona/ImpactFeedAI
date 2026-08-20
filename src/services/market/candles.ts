/**
 * Persisted candle contract and server read path.
 *
 * This module is the single definition of what a stored candle means, and it is
 * deliberately provider-agnostic: nothing here knows that Yahoo exists, what its
 * lookback limits are, or that it reports a fabricated zero volume outside
 * regular hours. Those are ingestion concerns and live in
 * `scripts/ingest/candle-provider.ts`. A later Polygon adapter should be
 * writable without touching this file.
 *
 * The version constant lives here rather than in the ingestion layer because
 * both sides need it and they must not drift: the backfill stamps rows with it
 * and every read path filters on it, exactly as `AssetReaction` already does
 * with `CURRENT_REACTION_CALCULATION_VERSION`.
 */
import { prisma } from "@/lib/prisma";
import type {
  Candle,
  CandleInterval,
  MarketSession,
  PriceBasis,
} from "@/types/market";

/**
 * Semantics of a stored candle. Bump this when the meaning of a persisted row
 * changes — a different bar-stamping convention, a different session
 * classification, a different volume rule — so that older rows opt out of every
 * read path until they have been deliberately re-ingested.
 *
 * Version 1: bars stamped at their open in UTC; session classified in
 * America/New_York against a 09:30–16:00 regular session; provider volume
 * withheld rather than zeroed outside that window; one declared `PriceBasis`
 * per row and never a mixture.
 */
export const CURRENT_CANDLE_INGESTION_VERSION = 1;

/**
 * Short codes used on the command line and in URLs. The database stores the
 * long enum form; nothing outside this map should have to know both.
 */
export const INTERVAL_CODE: Readonly<Record<CandleInterval, string>> = {
  ONE_MINUTE: "1m",
  FIVE_MINUTE: "5m",
  FIFTEEN_MINUTE: "15m",
  THIRTY_MINUTE: "30m",
  ONE_HOUR: "1h",
  ONE_DAY: "1d",
};

const CODE_TO_INTERVAL: Readonly<Record<string, CandleInterval>> =
  Object.fromEntries(
    Object.entries(INTERVAL_CODE).map(([interval, code]) => [code, interval]),
  ) as Record<string, CandleInterval>;

/** Resolve a short code such as `1h`. Returns null for anything unrecognised. */
export const intervalFromCode = (code: string): CandleInterval | null =>
  CODE_TO_INTERVAL[code.toLowerCase()] ?? null;

export const ALL_INTERVAL_CODES: readonly string[] =
  Object.values(INTERVAL_CODE);

/* ────────────────────────────── OHLC validity ───────────────────────────── */

export type OhlcViolation =
  | "non_finite"
  | "non_positive"
  | "high_below_open"
  | "high_below_close"
  | "high_below_low"
  | "low_above_open"
  | "low_above_close";

export interface OhlcCandidate {
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
}

/**
 * Every way a bar can be internally incoherent.
 *
 * A bar whose high is below its close is not a bar — it is two different
 * instruments, a partial write, or a provider bug. Persisting it would put a
 * shape on a chart that never traded, so ingestion drops it and counts it
 * rather than clamping the values into agreement.
 *
 * Returns all violations rather than the first, so a report can distinguish a
 * single odd bar from a systematically broken payload.
 */
export function ohlcViolations(candle: OhlcCandidate): OhlcViolation[] {
  const { open, high, low, close } = candle;
  const values = [open, high, low, close];

  if (values.some((v) => v === null || !Number.isFinite(v))) {
    return ["non_finite"];
  }
  // Non-null and finite past this point.
  const o = open as number;
  const h = high as number;
  const l = low as number;
  const c = close as number;

  if ([o, h, l, c].some((v) => v <= 0)) return ["non_positive"];

  const violations: OhlcViolation[] = [];
  if (h < o) violations.push("high_below_open");
  if (h < c) violations.push("high_below_close");
  if (h < l) violations.push("high_below_low");
  if (l > o) violations.push("low_above_open");
  if (l > c) violations.push("low_above_close");
  return violations;
}

export const isCoherentOhlc = (candle: OhlcCandidate): boolean =>
  ohlcViolations(candle).length === 0;

/* ─────────────────────────────── read path ──────────────────────────────── */

export interface GetCandlesArgs {
  symbol: string;
  interval: CandleInterval;
  /** Inclusive lower bound on `openTime`. */
  from: Date;
  /** Exclusive upper bound on `openTime`. */
  to: Date;
  /**
   * Which price basis to read. Defaults to as-traded, the only basis the Yahoo
   * intraday prototype writes. Never widened to "any": returning two bases in
   * one series is the contamination the basis column exists to prevent.
   */
  priceBasis?: PriceBasis;
  /** Hard cap, so a wide range cannot accidentally stream a whole instrument. */
  take?: number;
}

const DEFAULT_TAKE = 5_000;

/**
 * Read stored candles. Postgres only — this never calls a provider.
 *
 * Filters to the current ingestion version, so a schema or semantics change
 * makes older rows disappear from every chart until they are re-ingested rather
 * than silently mixing two conventions in one series.
 *
 * The upper bound is exclusive so that adjacent windows tile without
 * double-counting the boundary bar.
 */
export async function getCandles({
  symbol,
  interval,
  from,
  to,
  priceBasis = "AS_TRADED",
  take = DEFAULT_TAKE,
}: GetCandlesArgs): Promise<Candle[]> {
  const rows = await prisma.candle.findMany({
    where: {
      symbol,
      interval,
      priceBasis,
      ingestionVersion: CURRENT_CANDLE_INGESTION_VERSION,
      openTime: { gte: from, lt: to },
    },
    orderBy: { openTime: "asc" },
    take,
    select: {
      symbol: true,
      interval: true,
      openTime: true,
      open: true,
      high: true,
      low: true,
      close: true,
      volume: true,
      session: true,
      priceBasis: true,
    },
  });

  return rows.map((row) => ({
    symbol: row.symbol,
    interval: row.interval as CandleInterval,
    openTime: row.openTime,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,
    session: row.session as MarketSession,
    priceBasis: row.priceBasis as PriceBasis,
  }));
}

export interface EventCandleWindow {
  candles: Candle[];
  /**
   * Age of the release in days at load time. Resolved here, in the loader,
   * because reading the clock inside a component render makes that render a
   * non-pure function of its props — React's purity rule applies to Server
   * Components too. The presentation layer receives a number and compares it.
   */
  releaseAgeDays: number;
}

/**
 * Load the candles surrounding a release.
 *
 * A thin wrapper over {@link getCandles}, not a second query path: it issues
 * exactly one database read, through the same function, and only adds the
 * window arithmetic and the clock read that the caller would otherwise have to
 * do during render.
 */
export async function loadEventCandles({
  symbol,
  interval,
  releaseAt,
  windowMs,
}: {
  symbol: string;
  interval: CandleInterval;
  releaseAt: Date;
  windowMs: number;
}): Promise<EventCandleWindow> {
  const candles = await getCandles({
    symbol,
    interval,
    from: new Date(releaseAt.getTime() - windowMs),
    to: new Date(releaseAt.getTime() + windowMs),
  });

  return {
    candles,
    releaseAgeDays: Math.floor(
      (Date.now() - releaseAt.getTime()) / 86_400_000,
    ),
  };
}

export interface CandleCoverageRow {
  symbol: string;
  interval: CandleInterval;
  candles: number;
  earliest: Date | null;
  latest: Date | null;
}

/**
 * What the candle store actually holds, for verification and for the eventual
 * coverage surface. Current ingestion version only, for the same reason.
 */
export async function getCandleCoverage(): Promise<CandleCoverageRow[]> {
  const grouped = await prisma.candle.groupBy({
    by: ["symbol", "interval"],
    where: { ingestionVersion: CURRENT_CANDLE_INGESTION_VERSION },
    _count: { _all: true },
    _min: { openTime: true },
    _max: { openTime: true },
    orderBy: [{ symbol: "asc" }, { interval: "asc" }],
  });

  return grouped.map((row) => ({
    symbol: row.symbol,
    interval: row.interval as CandleInterval,
    candles: row._count._all,
    earliest: row._min.openTime,
    latest: row._max.openTime,
  }));
}
