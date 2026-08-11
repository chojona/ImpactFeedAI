import { describe, expect, it } from "vitest";

import {
  BLS_SERIES_BINDINGS,
  CURATED_SERIES_BY_EVENT_TYPE,
  FRED_SERIES_BINDINGS,
  METRICS,
  computeSurpriseInCanonicalUnit,
  deriveMetric,
  directionVsPrior,
  formatMetricSurprise,
  formatMetricValue,
  makeMetricHeadline,
  metricByCanonicalName,
  observationStartFor,
  transformLookback,
  type Observation,
} from "@/services/macro/metrics";

/** Monthly observations from a starting index level, compounding at `rate`/mo. */
const monthly = (
  startIso: string,
  values: (number | null)[],
): Observation[] => {
  const start = new Date(`${startIso}T00:00:00Z`);
  return values.map((value, i) => {
    const d = new Date(start);
    d.setUTCMonth(d.getUTCMonth() + i);
    return { iso: d.toISOString().slice(0, 10), value };
  });
};

describe("deriveMetric", () => {
  it("computes a year-over-year percentage and the previous month's YoY as prior", () => {
    // 14 months so index 13 has both a year-ago value and a prior YoY.
    const obs = monthly("2023-01-01", [
      100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113,
    ]);
    const derived = deriveMetric("yoy_pct", 13, obs);

    expect(derived).not.toBeNull();
    // 113 vs 101 a year earlier → +11.9%
    expect(derived!.value).toBeCloseTo(11.9, 1);
    // 112 vs 100 → +12.0%
    expect(derived!.prior).toBeCloseTo(12.0, 1);
  });

  it("returns null when there is not a full year of history", () => {
    const obs = monthly("2024-01-01", [100, 101, 102]);
    expect(deriveMetric("yoy_pct", 2, obs)).toBeNull();
  });

  it("returns null rather than a value when the observation itself is missing", () => {
    // BLS returns "-" for uncollected months; toFloat maps that to null.
    const obs = monthly("2023-01-01", [
      100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, null,
    ]);
    expect(deriveMetric("yoy_pct", 13, obs)).toBeNull();
  });

  it("reports a null prior when the preceding month is missing", () => {
    const obs = monthly("2023-01-01", [
      100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, null, 113,
    ]);
    const derived = deriveMetric("yoy_pct", 13, obs);
    expect(derived).not.toBeNull();
    expect(derived!.prior).toBeNull();
  });

  it("annualises a quarter-over-quarter change", () => {
    const obs = monthly("2024-01-01", [100, 101, 102]);
    const derived = deriveMetric("qoq_pct_annualized", 2, obs);
    // (102/101)^4 − 1 ≈ 4.0%
    expect(derived!.value).toBeCloseTo(4.0, 1);
  });

  it("computes a month-over-month level difference in thousands", () => {
    const obs = monthly("2024-01-01", [157_000, 157_150, 157_403]);
    const derived = deriveMetric("mom_diff_thousands", 2, obs);
    expect(derived!.value).toBe(253);
    expect(derived!.prior).toBe(150);
  });

  it("passes a level through with two-decimal rounding", () => {
    const obs = monthly("2024-01-01", [3.7, 3.9]);
    const derived = deriveMetric("level_pct", 1, obs);
    expect(derived!.value).toBe(3.9);
    expect(derived!.prior).toBe(3.7);
  });

  it("guards against a zero denominator in a YoY calculation", () => {
    const obs = monthly("2023-01-01", [
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
    ]);
    // index 12 divides by the zero at index 0.
    expect(deriveMetric("yoy_pct", 12, obs)).toBeNull();
  });
});

describe("directionVsPrior", () => {
  it("distinguishes an unknown prior from an unchanged reading", () => {
    // Regression: a null prior used to render as "in line with", asserting a
    // comparison that had never been made.
    expect(directionVsPrior(4.5, null, 0.01)).toBeNull();
    expect(directionVsPrior(4.5, 4.5, 0.01)).toBe("in line with");
  });

  it("treats a move inside the tolerance as in line", () => {
    expect(directionVsPrior(2.71, 2.7, 0.05)).toBe("in line with");
    expect(directionVsPrior(2.8, 2.7, 0.05)).toBe("above");
    expect(directionVsPrior(2.6, 2.7, 0.05)).toBe("below");
  });
});

describe("makeMetricHeadline", () => {
  it("omits the prior clause entirely when there is no prior", () => {
    const headline = makeMetricHeadline(
      METRICS.UNEMPLOYMENT_RATE,
      4.5,
      null,
      "2025-11-01",
    );
    expect(headline).not.toContain("prior");
    expect(headline).toBe("Unemployment rate 4.50% (Nov 2025)");
  });

  it("states the direction when a prior exists", () => {
    expect(
      makeMetricHeadline(METRICS.CPI_HEADLINE, 3.0, 2.7, "2025-09-01"),
    ).toBe("CPI prints 3.0% YoY — above prior (Sep 2025)");
  });

  it("labels quarterly metrics by quarter, not month", () => {
    expect(
      makeMetricHeadline(METRICS.GDP_REAL, 2.8, 1.6, "2025-04-01"),
    ).toContain("Q2 2025");
  });

  it("formats payrolls in thousands with a sign", () => {
    expect(
      makeMetricHeadline(METRICS.PAYROLLS, -23, 20, "2026-07-01"),
    ).toBe("Nonfarm payrolls -23k — below prior (Jul 2026)");
  });
});

describe("observationStartFor", () => {
  it("reaches back a full year plus a month for a YoY metric", () => {
    // Regression: `--since 2024-01-01` fetched from the cutoff, so the first 13
    // observations had no year-ago comparison and a year of requested range
    // silently produced no events at all.
    expect(observationStartFor(METRICS.CPI_HEADLINE, "2024-01-01")).toBe(
      "2022-12-01",
    );
  });

  it("reaches back two quarters for an annualised QoQ metric", () => {
    expect(observationStartFor(METRICS.GDP_REAL, "2024-01-01")).toBe(
      "2023-07-01",
    );
  });

  it("reaches back the minimum for a level metric", () => {
    expect(observationStartFor(METRICS.UNEMPLOYMENT_RATE, "2024-03-15")).toBe(
      "2024-02-01",
    );
  });

  it("covers enough history that the first requested period is derivable", () => {
    const lookback = transformLookback("yoy_pct");
    const start = observationStartFor(METRICS.CPI_HEADLINE, "2024-01-01");
    const obs = monthly(
      start,
      Array.from({ length: lookback + 1 }, (_, i) => 100 + i),
    );
    // The observation at the lookback index is the first requested month.
    expect(obs[lookback].iso).toBe("2024-01-01");
    expect(deriveMetric("yoy_pct", lookback, obs)).not.toBeNull();
  });
});

describe("computeSurpriseInCanonicalUnit", () => {
  it("is actual minus expected", () => {
    expect(computeSurpriseInCanonicalUnit(2.3, 2.4)).toBeCloseTo(-0.1, 4);
    expect(computeSurpriseInCanonicalUnit(517, 187)).toBe(330);
  });

  it("is null when either side is missing", () => {
    expect(computeSurpriseInCanonicalUnit(2.3, null)).toBeNull();
    expect(computeSurpriseInCanonicalUnit(null, 2.4)).toBeNull();
  });
});

describe("metric registry integrity", () => {
  it("gives every metric a canonical name resolvable back to itself", () => {
    for (const metric of Object.values(METRICS)) {
      expect(metricByCanonicalName(metric.canonicalName)).toBe(metric);
    }
  });

  it("keys every metric by its own key", () => {
    for (const [key, metric] of Object.entries(METRICS)) {
      expect(metric.key).toBe(key);
    }
  });

  it("resolves overlapping FRED and BLS series to the same canonical metric", () => {
    // This is what lets cross-source dedup recognise a BLS CPI-U print and a
    // FRED CPIAUCNS print as one economic release.
    const fredCpi = FRED_SERIES_BINDINGS.find(
      (b) => b.seriesId === "CPIAUCNS",
    );
    const blsCpi = BLS_SERIES_BINDINGS.find(
      (b) => b.seriesId === "CUUR0000SA0",
    );
    expect(fredCpi?.metric.canonicalName).toBe(blsCpi?.metric.canonicalName);
  });

  it("maps each curated event type to a metric of that same type", () => {
    for (const [eventType, binding] of Object.entries(
      CURATED_SERIES_BY_EVENT_TYPE,
    )) {
      expect(binding?.metric.eventType).toBe(eventType);
    }
  });
});

describe("formatMetricValue", () => {
  it("renders percentage metrics with a percent sign", () => {
    expect(formatMetricValue("CPI (headline, YoY)", 2.3)).toBe("2.3%");
    expect(formatMetricValue("Unemployment rate", 4.3)).toBe("4.30%");
  });

  it("renders payrolls in thousands with a sign", () => {
    expect(formatMetricValue("Nonfarm payrolls (MoM change)", 147)).toBe("+147k");
    expect(formatMetricValue("Nonfarm payrolls (MoM change)", -23)).toBe("-23k");
  });

  it("is null for a null value rather than rendering a zero", () => {
    expect(formatMetricValue("CPI (headline, YoY)", null)).toBeNull();
  });

  it("degrades to a bare number for an unknown metric instead of guessing a unit", () => {
    expect(formatMetricValue("CPI YoY", 2.3)).toBe("2.3");
  });
});

describe("formatMetricSurprise", () => {
  it("quotes percentage surprises in percentage points, not percent", () => {
    // A 2.4% consensus printing 2.3% is −0.1pp; calling it −0.1% would imply a
    // relative change.
    expect(formatMetricSurprise("CPI (headline, YoY)", -0.1)).toBe("-0.1pp");
    expect(formatMetricSurprise("CPI (headline, YoY)", 0.25)).toBe("+0.25pp");
  });

  it("quotes payroll surprises in thousands", () => {
    expect(formatMetricSurprise("Nonfarm payrolls (MoM change)", 330)).toBe(
      "+330k",
    );
  });

  it("is null when there is no surprise to report", () => {
    expect(formatMetricSurprise("CPI (headline, YoY)", null)).toBeNull();
  });
});
