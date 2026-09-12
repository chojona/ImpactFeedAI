/**
 * The v3 reaction calculation engine — pure, provider-agnostic, no I/O.
 *
 * Every measure draws its anchor AND its endpoint from a single series, so a
 * measurement can never span two price bases. An unmeasurable window produces
 * no entry: there is no placeholder, no null price and no fabricated zero.
 */
import {
  REACTION_MEASURES,
  sessionOffsetFor,
  type ReactionMeasure,
} from "@/services/events/reactionMeasures";
import {
  nativeCloseMinuteFor,
  sessionBasisFor,
  type SessionBasis,
} from "@/services/market/sessionBasis";
import {
  resolveReleaseSession,
  type SessionCalendar,
} from "@/services/market/sessionCalendar";
import { easternWallClock } from "@/services/macro/time";
import type { PriceBasis } from "@/types/market";

export interface DailyBar {
  /** Canonical session day, YYYY-MM-DD. */
  sessionDay: string;
  /** Provider bar stamp. Yahoo stamps daily bars at the session OPEN. */
  barAt: Date;
  close: number | null;
}

export interface SessionMeasurementInput {
  symbol: string;
  releaseAt: Date;
  calendar: SessionCalendar;
  daily: readonly DailyBar[];
  priceBasis: PriceBasis;
}

export interface ResolvedMeasurement {
  measure: ReactionMeasure;
  anchorKind: "PRIOR_SESSION_CLOSE" | "PRE_RELEASE_INTRADAY_BAR";
  anchorPrice: number;
  anchorBarAt: Date;
  anchorSessionDay: string;
  endpointPrice: number;
  endpointBarAt: Date;
  endpointSessionDay: string;
  releaseSessionDay: string;
  pctChange: number;
  priceBasis: PriceBasis;
  sessionBasis: SessionBasis;
}

export type MeasurementRefusal =
  | "undeclared_symbol"
  | "no_session_after_release"
  | "early_close_unknown"
  | "no_anchor_session"
  | "anchor_not_pre_release"
  | "unusable_anchor_price"
  | "no_intraday_anchor"
  | "no_intraday_endpoint"
  | "mixed_price_basis";

export type MeasurementOutcome =
  | { status: "resolved"; measurements: ResolvedMeasurement[] }
  | { status: "refused"; reason: MeasurementRefusal };

const usable = (v: number | null): v is number =>
  v !== null && Number.isFinite(v) && v > 0;

const pct = (anchor: number, endpoint: number): number =>
  ((endpoint - anchor) / anchor) * 100;

/**
 * Resolves `RELEASE_SESSION`, `SESSION_PLUS_1` and `SESSION_PLUS_5` for one
 * instrument. All three share one anchor: the close of the session
 * immediately preceding the release session. The anchor is validated once,
 * strictly before the release, using the instrument's OWN native close time —
 * this is what rejects an after-hours release on a late-closing instrument
 * (a `CONTINUOUS_24_7` instrument has not yet closed by the time a
 * `US_EQUITY_RTH` instrument's session has) and a release timestamped exactly
 * at a close, without a special-cased rule for either.
 */
export function resolveSessionMeasurements(
  input: SessionMeasurementInput,
): MeasurementOutcome {
  const sessionBasis = sessionBasisFor(input.symbol);
  if (sessionBasis === null) {
    return { status: "refused", reason: "undeclared_symbol" };
  }

  const release = resolveReleaseSession(input.calendar, input.releaseAt);
  if (release.status === "refused") {
    return { status: "refused", reason: release.reason };
  }

  const anchorDay = input.calendar.dayAt(release.index - 1);
  if (anchorDay === null) {
    return { status: "refused", reason: "no_anchor_session" };
  }

  // The anchor session must close, for THIS instrument, strictly before the
  // release. This is what rejects an after-hours release on a late-closing
  // instrument, and a release timestamped exactly at a close.
  const closeMinute = nativeCloseMinuteFor(
    sessionBasis,
    input.calendar.isEarlyClose(anchorDay),
  );
  const anchorClose = easternWallClock(
    anchorDay,
    Math.floor(closeMinute / 60),
    closeMinute % 60,
  );
  if (anchorClose.getTime() >= input.releaseAt.getTime()) {
    return { status: "refused", reason: "anchor_not_pre_release" };
  }

  const byDay = new Map(input.daily.map((bar) => [bar.sessionDay, bar]));
  const anchorBar = byDay.get(anchorDay);
  if (anchorBar === undefined || !usable(anchorBar.close)) {
    return { status: "refused", reason: "unusable_anchor_price" };
  }

  const measurements: ResolvedMeasurement[] = [];
  for (const measure of REACTION_MEASURES) {
    const offset = sessionOffsetFor(measure);
    if (offset === null) continue;

    const endpointDay = input.calendar.dayAt(release.index + offset);
    if (endpointDay === null) continue;
    const endpointBar = byDay.get(endpointDay);
    if (endpointBar === undefined || !usable(endpointBar.close)) continue;

    measurements.push({
      measure,
      anchorKind: "PRIOR_SESSION_CLOSE",
      anchorPrice: anchorBar.close,
      anchorBarAt: anchorBar.barAt,
      anchorSessionDay: anchorDay,
      endpointPrice: endpointBar.close,
      endpointBarAt: endpointBar.barAt,
      endpointSessionDay: endpointDay,
      releaseSessionDay: release.day,
      pctChange: pct(anchorBar.close, endpointBar.close),
      priceBasis: input.priceBasis,
      sessionBasis,
    });
  }

  return { status: "resolved", measurements };
}
