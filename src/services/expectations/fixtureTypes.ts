import type {
  ExpectationAsOfQuality,
  ExpectationHorizon,
  ExpectationKind,
} from "@/types/expectations";

/** On-disk / injected fixture row. Tests and adapters share this shape. */
export interface ExpectationFixtureRow {
  readonly id: string;
  readonly kind: ExpectationKind;
  readonly metricKey: string;
  readonly referencePeriodStart: string | null;
  readonly horizon: ExpectationHorizon;
  readonly value: number | null;
  readonly unit: string;
  readonly asOf: string | null;
  readonly asOfQuality: ExpectationAsOfQuality;
  readonly asOfDate: string | null;
  readonly source: string;
  readonly sourceUrl: string;
  readonly licenseNote: string;
  readonly providerRecordId: string | null;
}
