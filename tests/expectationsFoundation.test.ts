import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  archivedNewsToFixture,
  createArchivedNewsConsensusProvider,
  createClevelandNowcastProvider,
  createGdpNowProvider,
  createMarketImpliedProvider,
  createSpfProvider,
  FREE_EXPECTATION_SOURCES,
  isEligibleStreetSurpriseInput,
  ProspectiveConsensusCollector,
  selectFixtureExpectation,
  spfGrowthRowToFixture,
  toConsensusEstimate,
  validateExpectationObservation,
  type ExpectationFixtureRow,
} from "@/services/expectations";
import { validateConsensusEstimate } from "@/services/macro/consensus";
import type { ExpectationObservation } from "@/types/expectations";

const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/expectations",
);

function loadFixture(name: string): ExpectationFixtureRow[] {
  return JSON.parse(readFileSync(join(fixtureDir, name), "utf8")) as ExpectationFixtureRow[];
}

const fixedNow = () => new Date("2026-11-27T15:00:00.000Z");

describe("free expectation source inventory", () => {
  it("lists only $0 sources with separated kinds", () => {
    const kinds = new Set(
      Object.values(FREE_EXPECTATION_SOURCES).map((s) => s.kind),
    );
    expect(kinds).toEqual(
      new Set([
        "MODEL_NOWCAST",
        "PROFESSIONAL_SURVEY",
        "SURVEY_CONSENSUS",
        "MARKET_IMPLIED",
      ]),
    );
    for (const source of Object.values(FREE_EXPECTATION_SOURCES)) {
      expect(source.costUsd).toBe(0);
    }
  });
});

describe("validateExpectationObservation", () => {
  const base: ExpectationObservation = {
    id: "t1",
    kind: "MODEL_NOWCAST",
    metricKey: "GDP_REAL",
    referencePeriodStart: "2023-04-01",
    horizon: "release_print",
    value: 2.1,
    unit: "pct_saar",
    asOf: null,
    asOfQuality: "DATE_ONLY",
    asOfDate: "2023-07-27",
    source: "Atlanta Fed GDPNow",
    sourceUrl: "https://www.atlantafed.org/research-and-data/data/gdpnow",
    licenseNote: "personal/educational",
    providerRecordId: null,
    fetchedAt: fixedNow(),
    payloadHash: "abc",
  };

  it("rejects inventing an exact asOf under DATE_ONLY", () => {
    expect(() =>
      validateExpectationObservation(
        { ...base, asOf: new Date("2023-07-27T12:00:00Z") },
        null,
      ),
    ).toThrow(/DATE_ONLY/i);
  });

  it("rejects look-ahead VERIFIED asOf", () => {
    const releaseAt = new Date("2023-08-10T12:30:00Z");
    expect(() =>
      validateExpectationObservation(
        {
          ...base,
          kind: "SURVEY_CONSENSUS",
          asOfQuality: "VERIFIED",
          asOfDate: null,
          asOf: new Date("2023-08-10T12:31:00Z"),
          sourceUrl: "https://www.cnbc.com/example",
        },
        releaseAt,
      ),
    ).toThrow(/strictly before the release/i);
  });

  it("rejects SURVEY_CONSENSUS asOf equal to releaseAt", () => {
    const releaseAt = new Date("2023-08-10T12:30:00Z");
    expect(() =>
      validateExpectationObservation(
        {
          ...base,
          kind: "SURVEY_CONSENSUS",
          asOfQuality: "VERIFIED",
          asOfDate: null,
          asOf: new Date(releaseAt),
          sourceUrl: "https://www.cnbc.com/example",
        },
        releaseAt,
      ),
    ).toThrow(/strictly before the release/i);
  });
});

describe("Atlanta Fed GDPNow adapter", () => {
  const rows = loadFixture("gdpnow.json");
  const provider = createGdpNowProvider(rows, { now: fixedNow });

  it("returns a dated model nowcast and never claims survey consensus", async () => {
    // DATE_ONLY asOfDate 2023-07-27 is eligible only when the release calendar
    // day is strictly later — same-day remains uncertain without inventing a clock.
    const releaseAt = new Date("2023-07-28T12:30:00Z");
    const got = await provider.getExpectation({
      kind: "MODEL_NOWCAST",
      metricKey: "GDP_REAL",
      referencePeriodStart: "2023-04-01",
      releaseAt,
    });
    expect(got?.kind).toBe("MODEL_NOWCAST");
    expect(got?.value).toBe(2.4);
    expect(got?.asOfQuality).toBe("DATE_ONLY");
    expect(got?.asOf).toBeNull();
    expect(isEligibleStreetSurpriseInput(got!, releaseAt)).toBe(false);
  });

  it("returns null when the quarter is absent (missing stays missing)", async () => {
    const got = await provider.getExpectation({
      kind: "MODEL_NOWCAST",
      metricKey: "GDP_REAL",
      referencePeriodStart: "2023-07-01",
      releaseAt: null,
    });
    expect(got).toBeNull();
  });

  it("ignores SURVEY_CONSENSUS queries", async () => {
    const got = await provider.getExpectation({
      kind: "SURVEY_CONSENSUS",
      metricKey: "GDP_REAL",
      referencePeriodStart: "2023-04-01",
      releaseAt: null,
    });
    expect(got).toBeNull();
  });
});

describe("Cleveland Fed nowcast adapter", () => {
  const provider = createClevelandNowcastProvider(loadFixture("cleveland.json"), {
    now: fixedNow,
  });

  it("serves CPI nowcasts as MODEL_NOWCAST with DATE_ONLY provenance", async () => {
    const got = await provider.getExpectation({
      kind: "MODEL_NOWCAST",
      metricKey: "CPI_HEADLINE",
      referencePeriodStart: "2023-08-01",
      releaseAt: new Date("2023-09-13T12:30:00Z"),
    });
    expect(got?.value).toBe(3.6);
    expect(got?.kind).toBe("MODEL_NOWCAST");
    expect(toConsensusEstimate(got!, new Date("2023-09-13T12:30:00Z"))).toBeNull();
  });
});

describe("Philadelphia Fed SPF adapter", () => {
  it("maps growth rows without inventing exact survey clocks", () => {
    const fixture = spfGrowthRowToFixture({
      YEAR: 2023,
      QUARTER: 3,
      horizonColumn: "CPI2",
      value: 3.3,
      resultsReleaseDate: "2023-08-11",
      metricKey: "CPI_HEADLINE",
      aggregation: "median",
    });
    expect(fixture.kind).toBe("PROFESSIONAL_SURVEY");
    expect(fixture.asOfQuality).toBe("DATE_ONLY");
    expect(fixture.asOf).toBeNull();
  });

  it("returns PROFESSIONAL_SURVEY rows only for that kind", async () => {
    const provider = createSpfProvider(loadFixture("spf.json"), { now: fixedNow });
    const ok = await provider.getExpectation({
      kind: "PROFESSIONAL_SURVEY",
      metricKey: "CPI_HEADLINE",
      referencePeriodStart: null,
      releaseAt: null,
      horizon: "quarter_ahead",
    });
    expect(ok?.value).toBe(3.3);
    const wrong = await provider.getExpectation({
      kind: "SURVEY_CONSENSUS",
      metricKey: "CPI_HEADLINE",
      referencePeriodStart: null,
      releaseAt: null,
    });
    expect(wrong).toBeNull();
  });
});

describe("archived public-news consensus", () => {
  const releaseAt = new Date("2023-08-10T12:30:00.000Z");
  const provider = createArchivedNewsConsensusProvider(
    loadFixture("archived-news.json"),
    { now: fixedNow },
  );

  it("accepts a pre-release CNBC Dow Jones citation with VERIFIED asOf", async () => {
    const got = await provider.getExpectation({
      kind: "SURVEY_CONSENSUS",
      metricKey: "CPI_HEADLINE",
      referencePeriodStart: "2023-07-01",
      releaseAt,
    });
    expect(got?.value).toBe(3.3);
    expect(got?.asOfQuality).toBe("VERIFIED");
    expect(isEligibleStreetSurpriseInput(got!, releaseAt)).toBe(true);
    expect(toConsensusEstimate(got!, releaseAt)?.value).toBe(3.3);
  });

  it("rejects curated rows that lack any article timing", () => {
    expect(() =>
      archivedNewsToFixture({
        id: "bad",
        metricKey: "CPI_HEADLINE",
        referencePeriodStart: "2023-07-01",
        value: 3.3,
        unit: "pct_yoy",
        articlePublishedAt: null,
        articlePublishedDate: null,
        articleUrl: "https://www.cnbc.com/example",
        publisher: "CNBC",
        excerptNote: "no timing",
      }),
    ).toThrow(/requires articlePublishedAt or articlePublishedDate/i);
  });
});

describe("prospective free-source collector", () => {
  it("stores forward captures and refuses null numeric placeholders", () => {
    const collector = new ProspectiveConsensusCollector();
    expect(() =>
      collector.capture({
        id: "p1",
        metricKey: "CPI_HEADLINE",
        referencePeriodStart: "2026-10-01",
        value: null,
        unit: "pct_yoy",
        sourceUrl: "https://www.bls.gov/",
        publisher: "example",
        capturedNote: "no consensus printed",
        consensusAsOf: null,
        consensusAsOfDate: "2026-11-12",
      }),
    ).toThrow(/without a finite consensus value/i);

    collector.capture({
      id: "p2",
      metricKey: "CPI_HEADLINE",
      referencePeriodStart: "2026-10-01",
      value: 2.7,
      unit: "pct_yoy",
      sourceUrl: "https://www.example.com/calendar",
      publisher: "Permitted free calendar",
      capturedNote: "manual capture",
      consensusAsOf: null,
      consensusAsOfDate: "2026-11-12",
    });
    expect(collector.list()).toHaveLength(1);
  });
});

describe("market-implied adapter", () => {
  it("keeps FRED breakevens out of survey-consensus joins", async () => {
    const provider = createMarketImpliedProvider(
      loadFixture("market-implied.json"),
      { now: fixedNow },
    );
    const got = await provider.getExpectation({
      kind: "MARKET_IMPLIED",
      metricKey: "INFLATION_BREAKEVEN_5Y",
      referencePeriodStart: "2023-08-09",
      releaseAt: null,
    });
    expect(got?.kind).toBe("MARKET_IMPLIED");
    expect(toConsensusEstimate(got!, null)).toBeNull();
  });
});

describe("kind isolation", () => {
  it("does not allow MODEL_NOWCAST fixtures in a SURVEY_CONSENSUS provider", () => {
    expect(() =>
      createArchivedNewsConsensusProvider(loadFixture("gdpnow.json")),
    ).toThrow(/SURVEY_CONSENSUS/i);
  });
});

describe("point-in-time fixture selection", () => {
  const releaseAt = new Date("2023-08-10T12:30:00.000Z");
  const baseNews = {
    kind: "SURVEY_CONSENSUS" as const,
    metricKey: "CPI_HEADLINE",
    referencePeriodStart: "2023-07-01",
    horizon: "release_print" as const,
    unit: "pct_yoy",
    source: "CNBC (archived public citation)",
    sourceUrl: "https://www.cnbc.com/example-pit",
    licenseNote: "personal research citation",
    providerRecordId: null,
  };

  const preRelease: ExpectationFixtureRow = {
    ...baseNews,
    id: "news:pre",
    value: 3.3,
    asOf: "2023-08-09T19:35:00.000Z",
    asOfQuality: "VERIFIED",
    asOfDate: null,
  };

  const postRelease: ExpectationFixtureRow = {
    ...baseNews,
    id: "news:post",
    value: 3.9,
    asOf: "2023-08-10T13:00:00.000Z",
    asOfQuality: "VERIFIED",
    asOfDate: null,
  };

  const atReleaseInstant: ExpectationFixtureRow = {
    ...baseNews,
    id: "news:equal",
    value: 3.5,
    asOf: "2023-08-10T12:30:00.000Z",
    asOfQuality: "VERIFIED",
    asOfDate: null,
  };

  it("does not let a later post-release row displace an eligible earlier one", () => {
    const got = selectFixtureExpectation(
      [preRelease, postRelease],
      {
        kind: "SURVEY_CONSENSUS",
        metricKey: "CPI_HEADLINE",
        referencePeriodStart: "2023-07-01",
        releaseAt,
      },
      fixedNow(),
    );
    expect(got?.id).toBe("news:pre");
    expect(got?.value).toBe(3.3);
  });

  it("returns null when only post-release or equal-instant rows exist", () => {
    const onlyPost = selectFixtureExpectation(
      [postRelease, atReleaseInstant],
      {
        kind: "SURVEY_CONSENSUS",
        metricKey: "CPI_HEADLINE",
        referencePeriodStart: "2023-07-01",
        releaseAt,
      },
      fixedNow(),
    );
    expect(onlyPost).toBeNull();
  });

  it("keeps DATE_ONLY same-day rows ineligible without inventing a clock", () => {
    const sameDay: ExpectationFixtureRow = {
      ...baseNews,
      id: "news:date-only-same-day",
      value: 3.2,
      asOf: null,
      asOfQuality: "DATE_ONLY",
      asOfDate: "2023-08-10",
    };
    const got = selectFixtureExpectation(
      [sameDay, preRelease],
      {
        kind: "SURVEY_CONSENSUS",
        metricKey: "CPI_HEADLINE",
        referencePeriodStart: "2023-07-01",
        releaseAt,
      },
      fixedNow(),
    );
    expect(got?.id).toBe("news:pre");
    expect(got?.asOfQuality).toBe("VERIFIED");
  });

  it("is invariant under a frozen cutoff when later rows are appended", () => {
    const query = {
      kind: "SURVEY_CONSENSUS" as const,
      metricKey: "CPI_HEADLINE",
      referencePeriodStart: "2023-07-01",
      releaseAt,
    };
    const first = selectFixtureExpectation([preRelease], query, fixedNow());
    const afterAppend = selectFixtureExpectation(
      [preRelease, postRelease, atReleaseInstant],
      query,
      fixedNow(),
    );
    expect(first?.id).toBe("news:pre");
    expect(afterAppend?.id).toBe(first?.id);
    expect(afterAppend?.value).toBe(first?.value);
    expect(afterAppend?.payloadHash).toBe(first?.payloadHash);
  });
});

describe("strict street consensus asOf < releaseAt", () => {
  const releaseAt = new Date("2023-08-10T12:30:00.000Z");

  it("rejects equality in street eligibility and the legacy consensus bridge", () => {
    const atInstant: ExpectationObservation = {
      id: "eq",
      kind: "SURVEY_CONSENSUS",
      metricKey: "CPI_HEADLINE",
      referencePeriodStart: "2023-07-01",
      horizon: "release_print",
      value: 3.3,
      unit: "pct_yoy",
      asOf: new Date(releaseAt),
      asOfQuality: "VERIFIED",
      asOfDate: null,
      source: "example",
      sourceUrl: "https://www.cnbc.com/example",
      licenseNote: "test",
      providerRecordId: null,
      fetchedAt: fixedNow(),
      payloadHash: "x",
    };
    expect(isEligibleStreetSurpriseInput(atInstant, releaseAt)).toBe(false);
    expect(toConsensusEstimate(atInstant, releaseAt)).toBeNull();
    expect(() =>
      validateConsensusEstimate(
        {
          value: 3.3,
          asOf: new Date(releaseAt),
          source: "example",
          sourceUrl: "https://www.cnbc.com/example",
        },
        releaseAt,
      ),
    ).toThrow(/strictly before the release/i);
  });
});
