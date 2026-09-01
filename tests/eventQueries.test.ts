import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The query layer, with Postgres replaced by a recorder.
 *
 * `rankedCount` is the number the feed uses to say where its ranking stops, so
 * the two properties worth pinning without a database are structural: that it
 * is counted over the *same* filtered set as `total` (so a category or a search
 * moves it), and that it is counted with the *same* eligibility predicate as
 * the ranking itself (so the boundary marker cannot land one row off).
 *
 * The mock is deliberately shallow — it asserts what the layer asks for, not
 * what Postgres would answer. Coverage of the SQL itself belongs to
 * `npm run db:verify` against a real database.
 */

interface RecordedCall {
  model: string;
  args: unknown;
}

const calls: RecordedCall[] = [];
const rawQueries: { sql: string; values: unknown[] }[] = [];

/** Rows the fake `findMany` hands back, set per test. */
let matchingIds: string[] = [];
let pageRows: { id: string }[] = [];
let rankedRows: { n: number }[] = [{ n: 0 }];
let rankingIds: { id: string }[] = [];

vi.mock("@/lib/prisma", () => ({
  isDatabaseConfigured: () => true,
  prisma: {
    event: {
      groupBy: (args: unknown) => {
        calls.push({ model: "event.groupBy", args });
        return Promise.resolve([
          { eventType: "CPI", _count: { _all: 9 } },
          { eventType: "TARIFF", _count: { _all: 11 } },
        ]);
      },
      findMany: (args: unknown) => {
        calls.push({ model: "event.findMany", args });
        const where = (args as { where?: Record<string, unknown> }).where;
        const select = (args as { select?: unknown }).select;
        // The id-list pass is the one that selects only ids.
        if (select !== undefined) {
          return Promise.resolve(matchingIds.map((id) => ({ id })));
        }
        // Otherwise it is a page hydration; `where.id.in` marks the biggest sort.
        if (where && "id" in where) {
          const ids = (where.id as { in: string[] }).in;
          return Promise.resolve(pageRows.filter((r) => ids.includes(r.id)));
        }
        return Promise.resolve(pageRows);
      },
    },
    $queryRaw: (sql: { strings?: string[]; sql?: string; values: unknown[] }) => {
      const text = (sql.sql ?? sql.strings?.join("?") ?? "").toString();
      rawQueries.push({ sql: text, values: sql.values });
      if (/COUNT\(DISTINCT/i.test(text)) return Promise.resolve(rankedRows);
      return Promise.resolve(rankingIds);
    },
  },
}));

vi.mock("@/services/events/mapEvent", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/events/mapEvent")
  >("@/services/events/mapEvent");
  return {
    ...actual,
    // The mapper has its own suite; here it only has to preserve identity so the
    // ordering assertions mean something.
    mapEvent: (row: { id: string }) => ({ id: row.id }),
  };
});

const { listEvents } = await import("@/services/events/eventQueries");
const { CURRENT_REACTION_CALCULATION_VERSION } = await import(
  "@/services/events/timing"
);

/**
 * Bound parameters of a raw query, minus the leading calculation-version the
 * shared eligibility fragment contributes. What is left is what the *caller*
 * scoped the query to.
 */
const scopeOf = (values: unknown[]) => {
  expect(values[0]).toBe(CURRENT_REACTION_CALCULATION_VERSION);
  return values.slice(1);
};

const query = (over: Partial<Parameters<typeof listEvents>[0]> = {}) => ({
  category: "ALL" as const,
  sort: "newest" as const,
  search: "",
  offset: 0,
  limit: 12,
  ...over,
});

const findManyWheres = () =>
  calls
    .filter((c) => c.model === "event.findMany")
    .map((c) => (c.args as { where?: unknown }).where);

beforeEach(() => {
  calls.length = 0;
  rawQueries.length = 0;
  matchingIds = ["a", "b", "c"];
  pageRows = [{ id: "a" }, { id: "b" }, { id: "c" }];
  rankedRows = [{ n: 2 }];
  rankingIds = [{ id: "b" }, { id: "a" }, { id: "c" }];
});

describe("listEvents — rankedCount", () => {
  it("reports how many of the matching events can be ranked", async () => {
    const result = await listEvents(query());
    expect(result.rankedCount).toBe(2);
    expect(result.total).toBe(20);
  });

  it("counts with the same predicate the ranking orders by", async () => {
    await listEvents(query({ sort: "biggest" }));
    const [ranking] = rawQueries.filter((q) => /ORDER BY/i.test(q.sql));
    const [count] = rawQueries.filter((q) => /COUNT\(DISTINCT/i.test(q.sql));
    expect(ranking).toBeDefined();
    expect(count).toBeDefined();
    // Every clause of the eligibility rule appears in both, so a row the
    // ranking rejects cannot be counted as ranked.
    for (const clause of [
      "calculation_version",
      "pct_change_1d IS NOT NULL",
      "timing_status IN",
      "release_at IS NOT NULL",
      "BTRIM(e.timing_source)",
    ]) {
      expect(ranking?.sql).toContain(clause);
      expect(count?.sql).toContain(clause);
    }
  });

  it("counts nothing when the filter matches nothing", async () => {
    matchingIds = [];
    pageRows = [];
    const result = await listEvents(query({ sort: "biggest" }));
    expect(result.rankedCount).toBe(0);
    expect(result.events).toEqual([]);
    // No id list means no reason to ask Postgres anything else.
    expect(rawQueries).toHaveLength(0);
  });

  it("can report that none of the matches are rankable", async () => {
    rankedRows = [{ n: 0 }];
    const result = await listEvents(query({ sort: "biggest" }));
    expect(result.rankedCount).toBe(0);
    expect(result.total).toBeGreaterThan(0);
  });

  it("reports it under both sorts, so switching sort cannot change it", async () => {
    const newest = await listEvents(query({ sort: "newest" }));
    const biggest = await listEvents(query({ sort: "biggest" }));
    expect(newest.rankedCount).toBe(biggest.rankedCount);
  });
});

describe("listEvents — filters reach the ranked count", () => {
  it("narrows the counted set by category", async () => {
    await listEvents(query({ category: "INFLATION" }));
    // The id list the count runs over is fetched with the category filter…
    const idPass = findManyWheres()[0] as { eventType?: { in: string[] } };
    expect(idPass.eventType?.in).toContain("CPI");
    // …and the count is scoped to exactly those ids.
    const [count] = rawQueries.filter((q) => /COUNT\(DISTINCT/i.test(q.sql));
    expect(scopeOf(count?.values ?? [])).toEqual(matchingIds);
  });

  it("narrows the counted set by search text", async () => {
    await listEvents(query({ search: "payrolls" }));
    const idPass = findManyWheres()[0] as { OR?: unknown[] };
    expect(JSON.stringify(idPass.OR)).toContain("payrolls");
    const [count] = rawQueries.filter((q) => /COUNT\(DISTINCT/i.test(q.sql));
    expect(scopeOf(count?.values ?? [])).toEqual(matchingIds);
  });

  it("counts over the same where clause the page and total use", async () => {
    await listEvents(query({ category: "INFLATION", search: "CPI" }));
    const [idPass, pagePass] = findManyWheres();
    expect(idPass).toEqual(pagePass);
  });

  it("restricts the count to the filtered ids, never the whole table", async () => {
    matchingIds = ["only-one"];
    await listEvents(query({ category: "FED" }));
    const [count] = rawQueries.filter((q) => /COUNT\(DISTINCT/i.test(q.sql));
    expect(scopeOf(count?.values ?? [])).toEqual(["only-one"]);
  });
});

describe("listEvents — ordering", () => {
  it("restores the ranking order the id query returned", async () => {
    const result = await listEvents(query({ sort: "biggest" }));
    expect(result.events.map((e) => e.id)).toEqual(["b", "a", "c"]);
  });

  it("passes offset and limit through to the ranking query", async () => {
    await listEvents(query({ sort: "biggest", offset: 24, limit: 12 }));
    const [ranking] = rawQueries.filter((q) => /ORDER BY/i.test(q.sql));
    expect(scopeOf(ranking?.values ?? [])).toEqual([...matchingIds, 12, 24]);
  });
});
