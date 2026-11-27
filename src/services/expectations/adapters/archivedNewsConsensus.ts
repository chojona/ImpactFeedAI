import { selectFixtureExpectation } from "@/services/expectations/fixtureStore";
import type { ExpectationFixtureRow } from "@/services/expectations/fixtureTypes";
import { FREE_EXPECTATION_SOURCES } from "@/services/expectations/sources";
import { validateExpectationObservation } from "@/services/expectations/validate";
import type {
  ExpectationProvider,
  ExpectationQuery,
} from "@/types/expectations";

export interface ArchivedNewsConsensusInput {
  readonly id: string;
  readonly metricKey: string;
  readonly referencePeriodStart: string;
  readonly value: number;
  readonly unit: string;
  /** Exact article timestamp when the page states one (ISO-8601 UTC). */
  readonly articlePublishedAt: string | null;
  /** Calendar date when only a date is stated. */
  readonly articlePublishedDate: string | null;
  readonly articleUrl: string;
  readonly publisher: string;
  readonly excerptNote: string;
}

/**
 * Build a SURVEY_CONSENSUS fixture from a manually curated public-news citation.
 * Rejects incomplete provenance rather than filling gaps.
 */
export function archivedNewsToFixture(
  input: ArchivedNewsConsensusInput,
): ExpectationFixtureRow {
  if (!input.articlePublishedAt && !input.articlePublishedDate) {
    throw new Error(
      "Archived news consensus requires articlePublishedAt or articlePublishedDate.",
    );
  }
  if (input.articlePublishedAt && input.articlePublishedDate) {
    throw new Error(
      "Provide either an exact articlePublishedAt or a date, not both.",
    );
  }

  const asOfQuality = input.articlePublishedAt ? "VERIFIED" : "DATE_ONLY";
  return {
    id: input.id,
    kind: "SURVEY_CONSENSUS",
    metricKey: input.metricKey,
    referencePeriodStart: input.referencePeriodStart,
    horizon: "release_print",
    value: input.value,
    unit: input.unit,
    asOf: input.articlePublishedAt,
    asOfQuality,
    asOfDate: input.articlePublishedDate,
    source: `${input.publisher} (archived public citation)`,
    sourceUrl: input.articleUrl,
    licenseNote: `${FREE_EXPECTATION_SOURCES.archived_public_news.usageRestrictions} ${input.excerptNote}`,
    providerRecordId: input.articleUrl,
  };
}

export function createArchivedNewsConsensusProvider(
  rows: readonly ExpectationFixtureRow[],
  options?: { readonly now?: () => Date },
): ExpectationProvider {
  const profile = FREE_EXPECTATION_SOURCES.archived_public_news;
  for (const row of rows) {
    if (row.kind !== "SURVEY_CONSENSUS") {
      throw new Error("Archived news store may only hold SURVEY_CONSENSUS rows.");
    }
  }
  return {
    name: profile.id,
    kind: "SURVEY_CONSENSUS",
    async getExpectation(query: ExpectationQuery) {
      if (query.kind !== "SURVEY_CONSENSUS") return null;
      const found = selectFixtureExpectation(
        rows,
        query,
        options?.now?.() ?? new Date(),
      );
      if (!found) return null;
      return validateExpectationObservation(found, query.releaseAt);
    },
  };
}
