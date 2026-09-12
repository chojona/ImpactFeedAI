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
  economicCloseInstant,
  sessionBasisFor,
  type SessionBasis,
} from "@/services/market/sessionBasis";
import {
  resolveReleaseSession,
  type SessionCalendar,
} from "@/services/market/sessionCalendar";
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

  const byDay = new Map(input.daily.map((bar) => [bar.sessionDay, bar]));
  const anchorBar = byDay.get(anchorDay);
  if (anchorBar === undefined || !usable(anchorBar.close)) {
    return { status: "refused", reason: "unusable_anchor_price" };
  }

  // The anchor PRICE must have been realised strictly before the release.
  // Resolved from the bar itself — a daily bar's stamp is an identifier (and
  // for most bases, the session OPEN), never the instant its close became
  // known, and the session label alone cannot supply it either for a
  // continuous market. Looking the bar up first is therefore required, not
  // incidental ordering. This is what rejects an after-hours release on a
  // late-closing instrument and a release timestamped exactly at a close.
  const anchorClose = economicCloseInstant({
    basis: sessionBasis,
    sessionDay: anchorDay,
    barAt: anchorBar.barAt,
    isEarlyClose: input.calendar.isEarlyClose(anchorDay),
  });
  if (anchorClose.getTime() >= input.releaseAt.getTime()) {
    return { status: "refused", reason: "anchor_not_pre_release" };
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

const HOUR_MS = 3_600_000;
export const INTRADAY_ANCHOR_MAX_AGE_MS = 2 * HOUR_MS;
export const INTRADAY_ENDPOINT_TARGET_MS = HOUR_MS;
export const INTRADAY_ENDPOINT_SLIP_MS = 2 * HOUR_MS;

export interface IntradayBar {
  /** Provider bar stamp. Intraday bars are stamped at the bar OPEN. */
  barAt: Date;
  open: number | null;
  /**
   * Basis of THIS bar. Carried per-bar rather than once for the whole call so
   * the anchor/endpoint same-basis invariant is an enforced runtime check
   * rather than something merely implied by a scalar parameter — see spec
   * §15.2.
   */
  priceBasis: PriceBasis;
}

export interface IntradayMeasurementInput {
  symbol: string;
  releaseAt: Date;
  intraday: readonly IntradayBar[];
  /** Resolved by the session pass; recorded for cross-family joins. */
  releaseSessionDay: string;
}

/**
 * `INTRADAY_60M`: both bars come from the intraday series, so this
 * measurement never spans two price bases *in the ordinary case* — the
 * intraday/daily cross-series basis mismatch that broke v2 cannot recur here
 * because this function never receives the daily series at all. An
 * instrument's differing intraday-vs-daily basis declarations (XLK, XLE) are
 * therefore never a reason to suppress this measure — see spec §15.2, which
 * demotes the old v2 cross-series ratio guard to a reported diagnostic rather
 * than a precondition.
 *
 * The per-bar `priceBasis` is still compared between the chosen anchor and
 * endpoint bar as a defensive runtime check: if a provider ever returned an
 * internally inconsistent intraday series, this refuses rather than
 * publishing a measurement that silently combines two bases.
 */
export function resolveIntradayMeasurement(
  input: IntradayMeasurementInput,
): MeasurementOutcome {
  const sessionBasis = sessionBasisFor(input.symbol);
  if (sessionBasis === null) {
    return { status: "refused", reason: "undeclared_symbol" };
  }

  const sorted = [...input.intraday]
    .filter((bar) => Number.isFinite(bar.barAt.getTime()))
    .sort((a, b) => a.barAt.getTime() - b.barAt.getTime());

  const releaseMs = input.releaseAt.getTime();

  let anchor: IntradayBar | null = null;
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const bar = sorted[i];
    const ms = bar.barAt.getTime();
    if (ms >= releaseMs) continue;
    if (releaseMs - ms > INTRADAY_ANCHOR_MAX_AGE_MS) break;
    if (usable(bar.open)) {
      anchor = bar;
      break;
    }
  }
  if (anchor === null || !usable(anchor.open)) {
    return { status: "refused", reason: "no_intraday_anchor" };
  }

  const target = releaseMs + INTRADAY_ENDPOINT_TARGET_MS;
  let endpoint: IntradayBar | null = null;
  for (const bar of sorted) {
    const ms = bar.barAt.getTime();
    if (ms < target) continue;
    if (ms - target > INTRADAY_ENDPOINT_SLIP_MS) break;
    if (usable(bar.open)) {
      endpoint = bar;
      break;
    }
  }
  if (endpoint === null || !usable(endpoint.open)) {
    return { status: "refused", reason: "no_intraday_endpoint" };
  }

  if (anchor.priceBasis !== endpoint.priceBasis) {
    return { status: "refused", reason: "mixed_price_basis" };
  }

  return {
    status: "resolved",
    measurements: [
      {
        measure: "INTRADAY_60M",
        anchorKind: "PRE_RELEASE_INTRADAY_BAR",
        anchorPrice: anchor.open,
        anchorBarAt: anchor.barAt,
        anchorSessionDay: input.releaseSessionDay,
        endpointPrice: endpoint.open,
        endpointBarAt: endpoint.barAt,
        endpointSessionDay: input.releaseSessionDay,
        releaseSessionDay: input.releaseSessionDay,
        pctChange: pct(anchor.open, endpoint.open),
        priceBasis: anchor.priceBasis,
        sessionBasis,
      },
    ],
  };
}
