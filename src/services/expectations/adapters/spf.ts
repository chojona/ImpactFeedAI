import { selectFixtureExpectation } from "@/services/expectations/fixtureStore";
import type { ExpectationFixtureRow } from "@/services/expectations/fixtureTypes";
import { FREE_EXPECTATION_SOURCES } from "@/services/expectations/sources";
import type {
  ExpectationProvider,
  ExpectationQuery,
} from "@/types/expectations";

/**
 * Minimal SPF median/mean growth row as commonly exported from Philly Fed
 * Excel (YEAR, QUARTER, horizon columns). Exact survey clocks are not inferred.
 */
export interface SpfGrowthRow {
  readonly YEAR: number;
  readonly QUARTER: number;
  /** e.g. CPI2 = current-quarter annualized QoQ in SPF growth files. */
  readonly horizonColumn: string;
  readonly value: number | null;
  /** Published SPF results release date when known from spf-release-dates. */
  readonly resultsReleaseDate: string | null;
  readonly metricKey: string;
  readonly aggregation: "median" | "mean";
}

export function spfGrowthRowToFixture(row: SpfGrowthRow): ExpectationFixtureRow {
  const surveyPeriod = `${row.YEAR}-Q${row.QUARTER}`;
  const hasDate = row.resultsReleaseDate !== null;
  return {
    id: `spf:${row.aggregation}:${row.metricKey}:${surveyPeriod}:${row.horizonColumn}`,
    kind: "PROFESSIONAL_SURVEY",
    metricKey: row.metricKey,
    referencePeriodStart: null,
    horizon: horizonFromSpfColumn(row.horizonColumn),
    value: row.value,
    unit: "pct_saar",
    asOf: null,
    asOfQuality: hasDate ? "DATE_ONLY" : "MISSING",
    asOfDate: row.resultsReleaseDate,
    source: `Philadelphia Fed SPF (${row.aggregation})`,
    sourceUrl:
      "https://www.philadelphiafed.org/surveys-and-data/real-time-data-research/survey-of-professional-forecasters",
    licenseNote: FREE_EXPECTATION_SOURCES.philadelphia_spf.usageRestrictions,
    providerRecordId: `${surveyPeriod}:${row.horizonColumn}`,
  };
}

function horizonFromSpfColumn(column: string): ExpectationFixtureRow["horizon"] {
  if (/A$/i.test(column) || /10/i.test(column)) return "year_ahead";
  if (/[1-6]$/.test(column)) return "quarter_ahead";
  return "other";
}

export function createSpfProvider(
  rows: readonly ExpectationFixtureRow[],
  options?: { readonly now?: () => Date },
): ExpectationProvider {
  const profile = FREE_EXPECTATION_SOURCES.philadelphia_spf;
  return {
    name: profile.id,
    kind: "PROFESSIONAL_SURVEY",
    async getExpectation(query: ExpectationQuery) {
      if (query.kind !== "PROFESSIONAL_SURVEY") return null;
      return selectFixtureExpectation(rows, query, options?.now?.() ?? new Date());
    },
  };
}
