/** Expected coverage comes from source events and policy, never observed rows.
 * Missing optional windows are unresolved until archived source evidence proves
 * why the fixed measurement could not be made. Today's retention is not proof.
 */
import { REACTION_MEASURES } from "./reactionMeasures";
import { reactionTimingEligibility, type ReactionTimingInput } from "./timing";
import { checkInvariants, type VerifiableMeasurementRow } from "./measurementVerification";
import { buildSessionCalendar } from "../market/sessionCalendar";
import { sessionBasisFor } from "../market/sessionBasis";

export interface VerificationEvent extends ReactionTimingInput { id: string }
export interface VerificationRow extends VerifiableMeasurementRow { id: string; eventId: string; symbol: string }
export type CalendarEvidence = { status: "ok"; days: readonly string[] } | { status: "failed"; reason: string };
export interface Diagnostic { key: string; code: string; detail?: string }
export const measurementKey = (r: { eventId: string; symbol: string; measure: string }) => `${r.eventId}/${r.symbol}/${r.measure}`;

export async function verifyMeasurementDataset(input: {
  events: readonly VerificationEvent[];
  rows: readonly VerificationRow[];
  symbols: readonly string[];
  fetchCalendar: (event: VerificationEvent) => Promise<CalendarEvidence>;
}) {
  const diagnostics: Diagnostic[] = [];
  const eligible = input.events.filter(e => reactionTimingEligibility(e).eligible);
  const eventMap = new Map(input.events.map(e => [e.id, e]));
  const expected = new Set<string>();
  for (const e of eligible) for (const symbol of input.symbols) for (const measure of REACTION_MEASURES) expected.add(measurementKey({ eventId: e.id, symbol, measure }));
  const groups = new Map<string, VerificationRow[]>();
  for (const row of input.rows) {
    const key = measurementKey(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  let missing = 0;
  for (const key of expected) if (!groups.has(key)) {
    missing++;
    diagnostics.push({ key, code: "missing_expected_measurement", detail: "No archived unavailability evidence; do not infer nonexistence from current provider retention." });
  }
  let duplicateRows = 0;
  for (const [key, rows] of groups) if (rows.length > 1) {
    duplicateRows += rows.length - 1;
    diagnostics.push({ key, code: "duplicate_measurement", detail: `${rows.length} rows` });
  }
  const calendars = new Map<string, CalendarEvidence>();
  for (const event of eligible) {
    try { calendars.set(event.id, await input.fetchCalendar(event)); }
    catch { calendars.set(event.id, { status: "failed", reason: "reference fetch threw; retry with source evidence" }); }
    const evidence = calendars.get(event.id)!;
    if (evidence.status === "failed" || evidence.days.length === 0) diagnostics.push({ key: event.id, code: "reference_calendar_unavailable", detail: evidence.status === "failed" ? evidence.reason : "empty reference series" });
  }
  let valid = 0, invalid = 0, incomplete = 0, checked = 0, unexpected = 0;
  const byMeasure: Record<string, number> = {};
  const bySymbol: Record<string, number> = {};
  for (const row of input.rows) {
    const key = measurementKey(row);
    const problems: string[] = [];
    const event = eventMap.get(row.eventId);
    byMeasure[row.measure] = (byMeasure[row.measure] ?? 0) + 1;
    bySymbol[row.symbol] = (bySymbol[row.symbol] ?? 0) + 1;
    if (!expected.has(key)) { unexpected++; problems.push("unexpected_measurement"); }
    if (!event || !reactionTimingEligibility(event).eligible) problems.push("ineligible_event_timing");
    if (groups.get(key)!.length > 1) problems.push("duplicate_measurement");
    const basis = sessionBasisFor(row.symbol);
    if (basis === null || basis !== row.sessionBasis) problems.push("symbol_session_basis_mismatch");
    // A generic 17:00 assumption is not authoritative for CME/ICE contracts,
    // settlements or holiday schedules. Preserve rows, fail qualification.
    if (basis === "EXTENDED_FUTURES" && row.measure !== "INTRADAY_60M") problems.push("unsupported_native_calendar");
    const evidence = calendars.get(row.eventId);
    if (event?.releaseAt && evidence?.status === "ok" && evidence.days.length > 0) {
      checked++;
      const calendar = buildSessionCalendar(evidence.days);
      problems.push(...checkInvariants(row, { releaseAt: event.releaseAt, sessionDays: calendar.sessionDays, isEarlyClose: calendar.isEarlyClose, earlyCloseKnown: calendar.earlyCloseKnown }));
    } else {
      problems.push("row_not_fully_checked");
    }
    for (const code of new Set(problems)) diagnostics.push({ key, code, detail: `row ${row.id}` });
    if (problems.some(code => code !== "row_not_fully_checked")) invalid++;
    else if (!problems.length) valid++;
    else incomplete++;
  }
  if (!eligible.length || !input.rows.length || !checked) diagnostics.push({ key: "dataset", code: "zero_verification_coverage" });
  const summary = {
    sourceEvents: input.events.length, eligibleEvents: eligible.length,
    ineligibleEvents: input.events.length - eligible.length,
    expected: expected.size, observed: input.rows.length, checked, unchecked: input.rows.length - checked, valid, invalid, incomplete,
    missing, duplicateRows, unexpected,
    legitimatelyUnavailable: 0,
    unresolvedAvailability: missing,
    byMeasure, bySymbol,
  };
  return {
    policyVersion: "phase-0.5-strict-1", summary, diagnostics,
    passed: diagnostics.length === 0,
    pointInTimeCertified: false,
    limitations: [
      "Economic completion is a lower bound, not evidence of actual provider delivery or historical adjustment vintage.",
      "No archived unavailability evidence was supplied. Missing rows remain failures, including expired intraday history.",
      "Reference session dates are provider evidence; official NYSE hours are independently fixture-tested.",
      "Return checks reconcile stored prices, not unarchived provider input series.",
    ],
  };
}
