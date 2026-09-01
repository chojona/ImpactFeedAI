import { describe, expect, it } from "vitest";

import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  ZERO_CATEGORY_COUNTS,
  feedQueryKey,
  parseEventListQuery,
  parseFeedQuery,
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

/**
 * The browser URL and the HTTP API spell the category differently — `cat` in a
 * shared link, `type` in the request the client makes from it. The feed page
 * server-renders from the first and the client fetches with the second, so the
 * two parsers agreeing is what keeps the server's page one and the client's
 * next page describing the same result set.
 */
describe("parseFeedQuery", () => {
  const parseFeed = (qs: string) => parseFeedQuery(new URLSearchParams(qs));

  it("reads the category from `cat`, as the feed URL spells it", () => {
    expect(parseFeed("cat=INFLATION").category).toBe("INFLATION");
    expect(parseFeed("cat=BANANA").category).toBe("ALL");
    expect(parseFeed("").category).toBe("ALL");
  });

  it("ignores the API's spelling, so one URL cannot mean two things", () => {
    expect(parseFeed("type=INFLATION").category).toBe("ALL");
    expect(parse("cat=INFLATION").category).toBe("ALL");
  });

  it("shares sort, search and paging rules with the API parser", () => {
    expect(parseFeed("sort=biggest&q=%20cpi%20&limit=999&offset=24")).toEqual({
      category: "ALL",
      sort: "biggest",
      search: "cpi",
      offset: 24,
      limit: MAX_LIMIT,
    });
  });
});

describe("feedQueryKey", () => {
  it("identifies a result set, ignoring how far into it the reader has paged", () => {
    const base = { category: "FED" as const, sort: "biggest" as const, search: "cpi" };
    expect(feedQueryKey(base)).toBe(feedQueryKey({ ...base }));
  });

  it("separates result sets that differ in any dimension", () => {
    const keys = new Set([
      feedQueryKey({ category: "ALL", sort: "newest", search: "" }),
      feedQueryKey({ category: "FED", sort: "newest", search: "" }),
      feedQueryKey({ category: "ALL", sort: "biggest", search: "" }),
      feedQueryKey({ category: "ALL", sort: "newest", search: "cpi" }),
    ]);
    expect(keys.size).toBe(4);
  });

  it("matches between the two parsers for the same view", () => {
    const fromFeedUrl = parseFeedQuery(
      new URLSearchParams("cat=FED&sort=biggest&q=cpi"),
    );
    const fromApiRequest = parseEventListQuery(
      new URLSearchParams("type=FED&sort=biggest&q=cpi&offset=12"),
    );
    expect(feedQueryKey(fromFeedUrl)).toBe(feedQueryKey(fromApiRequest));
  });
});

describe("ZERO_CATEGORY_COUNTS", () => {
  it("carries a zero for every pill the filter bar renders", () => {
    expect(Object.values(ZERO_CATEGORY_COUNTS).every((n) => n === 0)).toBe(true);
    for (const key of [
      "ALL",
      "TARIFF",
      "INFLATION",
      "FED",
      "JOBS",
      "GEOPOLITICAL",
      "EARNINGS",
      "OTHER",
    ]) {
      expect(ZERO_CATEGORY_COUNTS).toHaveProperty(key);
    }
  });
});
