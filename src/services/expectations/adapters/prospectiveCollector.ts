import { archivedNewsToFixture } from "@/services/expectations/adapters/archivedNewsConsensus";
import type { ExpectationFixtureRow } from "@/services/expectations/fixtureTypes";
import { selectFixtureExpectation } from "@/services/expectations/fixtureStore";
import { FREE_EXPECTATION_SOURCES } from "@/services/expectations/sources";
import type {
  ExpectationProvider,
  ExpectationQuery,
} from "@/types/expectations";

export interface ProspectiveCapture {
  readonly id: string;
  readonly metricKey: string;
  readonly referencePeriodStart: string;
  readonly value: number | null;
  readonly unit: string;
  readonly sourceUrl: string;
  readonly publisher: string;
  readonly capturedNote: string;
  readonly consensusAsOf: string | null;
  readonly consensusAsOfDate: string | null;
}

/**
 * In-memory prospective collector for permitted free sources going forward.
 * Does not backfill history. Null values are stored as missing, never as 0.
 */
export class ProspectiveConsensusCollector {
  private readonly rows: ExpectationFixtureRow[] = [];

  list(): readonly ExpectationFixtureRow[] {
    return this.rows;
  }

  capture(input: ProspectiveCapture): ExpectationFixtureRow {
    if (input.value !== null && !Number.isFinite(input.value)) {
      throw new Error("Prospective capture value must be finite or null.");
    }
    if (input.value === null) {
      // Explicit missing: do not create a numeric row.
      throw new Error(
        "Refusing to store a prospective row without a finite consensus value; leave the series missing instead.",
      );
    }

    const row = archivedNewsToFixture({
      id: input.id,
      metricKey: input.metricKey,
      referencePeriodStart: input.referencePeriodStart,
      value: input.value,
      unit: input.unit,
      articlePublishedAt: input.consensusAsOf,
      articlePublishedDate: input.consensusAsOfDate,
      articleUrl: input.sourceUrl,
      publisher: input.publisher,
      excerptNote: `${FREE_EXPECTATION_SOURCES.prospective_free_calendar.usageRestrictions} ${input.capturedNote}`,
    });
    this.rows.push(row);
    return row;
  }

  asProvider(options?: { readonly now?: () => Date }): ExpectationProvider {
    const profile = FREE_EXPECTATION_SOURCES.prospective_free_calendar;
    return {
      name: profile.id,
      kind: "SURVEY_CONSENSUS",
      getExpectation: async (query: ExpectationQuery) => {
        if (query.kind !== "SURVEY_CONSENSUS") return null;
        return selectFixtureExpectation(
          this.rows,
          query,
          options?.now?.() ?? new Date(),
        );
      },
    };
  }
}
