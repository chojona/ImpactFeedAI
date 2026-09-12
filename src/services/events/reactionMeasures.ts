/**
 * The four standardized v3 reaction measures.
 *
 * A measure's anchor is fixed by the measure, never by what data happened to
 * be available. That is the property that makes two values stored under the
 * same measure comparable — see
 * docs/superpowers/specs/2026-09-12-reaction-measurement-contract-design.md
 * §2. It replaces the v2 `ReactionWindow` ("1h" | "1d" | "1w"), whose anchor
 * silently switched between an intraday bar and a prior-session close
 * depending on Yahoo's rolling intraday window — producing two incompatible
 * measurement methodologies stored under one label. See spec §1.
 */
export type ReactionMeasure =
  | "INTRADAY_60M"
  | "RELEASE_SESSION"
  | "SESSION_PLUS_1"
  | "SESSION_PLUS_5";

export const REACTION_MEASURES: readonly ReactionMeasure[] = [
  "INTRADAY_60M",
  "RELEASE_SESSION",
  "SESSION_PLUS_1",
  "SESSION_PLUS_5",
];

/**
 * The measure the product headlines. `RELEASE_SESSION` has the broadest
 * historical coverage (daily bars extend decades; intraday does not) and a
 * standardized one-session exposure. It is NOT the temporally tightest
 * measure — `INTRADAY_60M` is, where it exists (spec §3.1).
 */
export const HEADLINE_MEASURE: ReactionMeasure = "RELEASE_SESSION";

export type MeasureFamily = "INTRADAY" | "SESSION";

const FAMILY: Readonly<Record<ReactionMeasure, MeasureFamily>> = {
  INTRADAY_60M: "INTRADAY",
  RELEASE_SESSION: "SESSION",
  SESSION_PLUS_1: "SESSION",
  SESSION_PLUS_5: "SESSION",
};

export const measureFamily = (measure: ReactionMeasure): MeasureFamily =>
  FAMILY[measure];

/** Trading sessions after the release session. Null for the intraday family. */
const SESSION_OFFSET: Readonly<Record<ReactionMeasure, number | null>> = {
  INTRADAY_60M: null,
  RELEASE_SESSION: 0,
  SESSION_PLUS_1: 1,
  SESSION_PLUS_5: 5,
};

export const sessionOffsetFor = (measure: ReactionMeasure): number | null =>
  SESSION_OFFSET[measure];

/**
 * User-facing labels. "One week" is deliberately not used for
 * `SESSION_PLUS_5`: five trading sessions is seven calendar days only when no
 * holiday falls inside the window.
 */
export const MEASURE_LABELS: Readonly<Record<ReactionMeasure, string>> = {
  INTRADAY_60M: "First hour",
  RELEASE_SESSION: "Release session",
  SESSION_PLUS_1: "Next session",
  SESSION_PLUS_5: "5 sessions",
};

export const MEASURE_DESCRIPTIONS: Readonly<Record<ReactionMeasure, string>> = {
  INTRADAY_60M: "60 minutes after the release instant",
  RELEASE_SESSION:
    "Prior session close to the close of the session containing the release",
  SESSION_PLUS_1: "Prior session close to the close of the following session",
  SESSION_PLUS_5: "Prior session close to the close five sessions later",
};
