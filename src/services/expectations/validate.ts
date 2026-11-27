import type {
  ExpectationAsOfQuality,
  ExpectationKind,
  ExpectationObservation,
} from "@/types/expectations";

const KINDS: ReadonlySet<ExpectationKind> = new Set([
  "SURVEY_CONSENSUS",
  "MODEL_NOWCAST",
  "PROFESSIONAL_SURVEY",
  "MARKET_IMPLIED",
]);

/**
 * Validate an expectation before any consumer may treat it as research input.
 * Throws rather than silently accepting look-ahead, unsourced, or kind-mixed
 * records. Does not invent `asOf`.
 */
export function validateExpectationObservation(
  observation: ExpectationObservation,
  releaseAt: Date | null,
): ExpectationObservation {
  if (!KINDS.has(observation.kind)) {
    throw new Error(`Unknown expectation kind: ${String(observation.kind)}`);
  }
  if (observation.value !== null && !Number.isFinite(observation.value)) {
    throw new Error("Expectation value must be finite or null.");
  }
  if (observation.value === 0 && observation.metricKey.length === 0) {
    throw new Error("Expectation value 0 requires a metric identity.");
  }
  if (observation.source.trim().length === 0) {
    throw new Error("Expectation source is required.");
  }
  if (observation.licenseNote.trim().length === 0) {
    throw new Error("Expectation licenseNote is required.");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(observation.sourceUrl);
  } catch {
    throw new Error("Expectation sourceUrl must be an absolute URL.");
  }
  if (parsedUrl.protocol !== "https:") {
    throw new Error("Expectation sourceUrl must use HTTPS.");
  }

  const asOfQuality = observation.asOfQuality;
  assertAsOfConsistency(observation.asOf, observation.asOfDate, asOfQuality);

  if (observation.asOf && releaseAt) {
    const asOfMs = observation.asOf.getTime();
    const releaseMs = releaseAt.getTime();
    // Street survey consensus must be strictly pre-release (asOf < releaseAt).
    if (
      observation.kind === "SURVEY_CONSENSUS" &&
      asOfQuality === "VERIFIED" &&
      asOfMs >= releaseMs
    ) {
      throw new Error(
        "SURVEY_CONSENSUS asOf must be strictly before the release instant.",
      );
    }
    if (asOfMs > releaseMs) {
      throw new Error("Expectation asOf cannot be after the release instant.");
    }
  }

  if (
    observation.asOfDate &&
    releaseAt &&
    asOfQuality === "DATE_ONLY"
  ) {
    const releaseDay = releaseAt.toISOString().slice(0, 10);
    if (observation.asOfDate > releaseDay) {
      throw new Error("Expectation asOfDate cannot be after the release date.");
    }
  }

  return {
    ...observation,
    source: observation.source.trim(),
    sourceUrl: parsedUrl.toString(),
    licenseNote: observation.licenseNote.trim(),
    asOf: observation.asOf ? new Date(observation.asOf) : null,
  };
}

function assertAsOfConsistency(
  asOf: Date | null,
  asOfDate: string | null,
  quality: ExpectationAsOfQuality,
): void {
  if (quality === "VERIFIED") {
    if (!asOf || Number.isNaN(asOf.getTime())) {
      throw new Error("VERIFIED asOfQuality requires an exact asOf instant.");
    }
    return;
  }
  if (quality === "DATE_ONLY") {
    if (asOf !== null) {
      throw new Error(
        "DATE_ONLY asOfQuality forbids inventing an exact asOf instant.",
      );
    }
    if (!asOfDate || !/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
      throw new Error("DATE_ONLY asOfQuality requires YYYY-MM-DD asOfDate.");
    }
    return;
  }
  if (quality === "MISSING") {
    if (asOf !== null || asOfDate !== null) {
      throw new Error("MISSING asOfQuality requires null asOf and asOfDate.");
    }
  }
}

/**
 * Street-style surprise may use SURVEY_CONSENSUS only when as-of is exact and
 * strictly before release (`asOf < releaseAt`). Equality is not pre-release.
 * Nowcasts and SPF never qualify.
 */
export function isEligibleStreetSurpriseInput(
  observation: ExpectationObservation,
  releaseAt: Date | null,
): boolean {
  if (observation.kind !== "SURVEY_CONSENSUS") return false;
  if (observation.value === null) return false;
  if (observation.asOfQuality !== "VERIFIED" || !observation.asOf) return false;
  if (!releaseAt) return false;
  return observation.asOf.getTime() < releaseAt.getTime();
}
