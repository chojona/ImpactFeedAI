import { isFixtureRowEligibleAtRelease } from "@/services/expectations/eligibility";
import type { ExpectationFixtureRow } from "@/services/expectations/fixtureTypes";
import { sha256Hex } from "@/services/expectations/hash";
import { validateExpectationObservation } from "@/services/expectations/validate";
import type {
  ExpectationObservation,
  ExpectationQuery,
} from "@/types/expectations";

export function fixtureRowToObservation(
  row: ExpectationFixtureRow,
  fetchedAt: Date,
): ExpectationObservation {
  const payloadHash = sha256Hex(JSON.stringify(row));
  return validateExpectationObservation(
    {
      id: row.id,
      kind: row.kind,
      metricKey: row.metricKey,
      referencePeriodStart: row.referencePeriodStart,
      horizon: row.horizon,
      value: row.value,
      unit: row.unit,
      asOf: row.asOf ? new Date(row.asOf) : null,
      asOfQuality: row.asOfQuality,
      asOfDate: row.asOfDate,
      source: row.source,
      sourceUrl: row.sourceUrl,
      licenseNote: row.licenseNote,
      providerRecordId: row.providerRecordId,
      fetchedAt,
      payloadHash,
    },
    null,
  );
}

function rankKey(row: ExpectationFixtureRow): string {
  return row.asOf ?? row.asOfDate ?? "";
}

/**
 * Select the latest *point-in-time eligible* fixture row for a query.
 * Post-release (or same-instant / same-day uncertain) rows are excluded before
 * ranking so they cannot displace an earlier eligible snapshot. Returns null
 * when nothing eligible matches — missing stays missing.
 */
export function selectFixtureExpectation(
  rows: readonly ExpectationFixtureRow[],
  query: ExpectationQuery,
  fetchedAt: Date,
): ExpectationObservation | null {
  const matches = rows.filter((row) => {
    if (row.kind !== query.kind) return false;
    if (row.metricKey !== query.metricKey) return false;
    if (
      query.referencePeriodStart !== null &&
      row.referencePeriodStart !== query.referencePeriodStart
    ) {
      return false;
    }
    if (query.horizon && row.horizon !== query.horizon) return false;
    return isFixtureRowEligibleAtRelease(row, query.releaseAt);
  });

  if (matches.length === 0) return null;

  const ranked = [...matches].sort((a, b) => {
    const aKey = rankKey(a);
    const bKey = rankKey(b);
    return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
  });
  const chosen = ranked[ranked.length - 1];
  if (!chosen) return null;

  const observation = fixtureRowToObservation(chosen, fetchedAt);
  return validateExpectationObservation(observation, query.releaseAt);
}
