import { describe, expect, it } from "vitest";

import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  parseEventListQuery,
} from "@/services/events/queryParams";

const parse = (qs: string) => parseEventListQuery(new URLSearchParams(qs));

describe("parseEventListQuery", () => {
  it("defaults an empty query string", () => {
    expect(parse("")).toEqual({
      category: "ALL",
      sort: "newest",
      search: "",
      offset: 0,
      limit: DEFAULT_LIMIT,
    });
  });

  it("accepts every valid category", () => {
    for (const type of [
      "ALL",
      "TARIFF",
      "INFLATION",
      "FED",
      "JOBS",
      "GEOPOLITICAL",
      "EARNINGS",
      "OTHER",
    ]) {
      expect(parse(`type=${type}`).category).toBe(type);
    }
  });

  it("falls back to ALL for an unknown or differently-cased category", () => {
    expect(parse("type=BANANA").category).toBe("ALL");
    expect(parse("type=inflation").category).toBe("ALL");
    expect(parse("type=").category).toBe("ALL");
  });

  it("accepts only the two sort modes", () => {
    expect(parse("sort=biggest").sort).toBe("biggest");
    expect(parse("sort=newest").sort).toBe("newest");
    expect(parse("sort=oldest").sort).toBe("newest");
  });

  it("trims the search term", () => {
    expect(parse("q=%20%20cpi%20%20").search).toBe("cpi");
    expect(parse("q=").search).toBe("");
  });

  it("clamps limit to the maximum instead of rejecting it", () => {
    expect(parse(`limit=${MAX_LIMIT + 500}`).limit).toBe(MAX_LIMIT);
    expect(parse("limit=25").limit).toBe(25);
  });

  it("falls back to the default limit for non-integer input", () => {
    for (const raw of ["abc", "-5", "1.5", "NaN", "Infinity", "1e3"]) {
      // 1e3 parses as 1000 numerically and is an integer, so it clamps instead.
      const expected = raw === "1e3" ? MAX_LIMIT : DEFAULT_LIMIT;
      expect(parse(`limit=${raw}`).limit).toBe(expected);
    }
  });

  it("falls back to offset 0 for invalid input", () => {
    expect(parse("offset=-1").offset).toBe(0);
    expect(parse("offset=abc").offset).toBe(0);
    expect(parse("offset=36").offset).toBe(36);
  });

  it("does not cap offset — deep pagination stays reachable", () => {
    expect(parse("offset=100000").offset).toBe(100000);
  });

  it("parses a full query", () => {
    expect(parse("type=FED&sort=biggest&q=powell&offset=24&limit=6")).toEqual({
      category: "FED",
      sort: "biggest",
      search: "powell",
      offset: 24,
      limit: 6,
    });
  });
});
