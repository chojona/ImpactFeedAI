import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `listCalendarEvents` must rank by effective calendar instant in SQL *before*
 * LIMIT. Ordering by id then taking N drops the newest mixed-field events once
 * the matching set exceeds the page size.
 */

const calls: { model: string; args: unknown }[] = [];
const rawQueries: { sql: string; values: unknown[] }[] = [];
let rankedIds: { id: string }[] = [];
let pageRows: { id: string }[] = [];

vi.mock("@/lib/prisma", () => ({
  isDatabaseConfigured: () => true,
  prisma: {
    event: {
      findMany: (args: unknown) => {
        calls.push({ model: "event.findMany", args });
        const where = (args as { where?: { id?: { in: string[] } } }).where;
        const ids = where?.id?.in ?? [];
        return Promise.resolve(pageRows.filter((row) => ids.includes(row.id)));
      },
    },
    $queryRaw: (sql: { strings?: string[]; sql?: string; values: unknown[] }) => {
      const text = (sql.sql ?? sql.strings?.join("?") ?? "").toString();
      rawQueries.push({ sql: text, values: sql.values });
      return Promise.resolve(rankedIds);
    },
  },
}));

vi.mock("@/services/events/mapEvent", () => ({
  // Enough shape for sortCalendarEvents; identity preserved for order asserts.
  mapEvent: (row: { id: string }) => ({
    id: row.id,
    occurredAt: "2025-01-01T00:00:00.000Z",
    timing: {
      releaseAt: null,
      releaseDate: null,
      status: "UNVERIFIED",
      source: null,
      reactionEligible: false,
      ineligibilityReason: "untrusted_status",
    },
  }),
}));

const { listCalendarEvents } = await import("@/services/events/eventQueries");
const { DEFAULT_CALENDAR_TAKE } = await import(
  "@/services/events/calendarView"
);

beforeEach(() => {
  calls.length = 0;
  rawQueries.length = 0;
  rankedIds = [];
  pageRows = [];
});

describe("listCalendarEvents — SQL ranks before LIMIT", () => {
  it("orders by coalesced releaseAt/releaseDate/occurredAt and limits in SQL", async () => {
    rankedIds = Array.from({ length: DEFAULT_CALENDAR_TAKE }, (_, i) => ({
      id: `new-${i}`,
    }));
    pageRows = rankedIds.map((row) => ({ id: row.id }));

    await listCalendarEvents({
      from: new Date("2024-01-01T00:00:00.000Z"),
      to: new Date("2026-12-31T23:59:59.000Z"),
      take: DEFAULT_CALENDAR_TAKE,
    });

    expect(rawQueries).toHaveLength(1);
    const sql = rawQueries[0]?.sql ?? "";
    expect(sql).toMatch(/COALESCE/i);
    expect(sql).toMatch(/release_at/i);
    expect(sql).toMatch(/release_date/i);
    expect(sql).toMatch(/occurred_at/i);
    expect(sql).toMatch(/INTERVAL '12 hours'/i);
    expect(sql).toMatch(/ORDER BY/i);
    expect(sql).toMatch(/LIMIT/i);
    expect(rawQueries[0]?.values).toContain(DEFAULT_CALENDAR_TAKE);

    const hydrate = calls.find((c) => c.model === "event.findMany");
    const requested = (
      hydrate?.args as { where?: { id?: { in: string[] } } }
    ).where?.id?.in;
    expect(requested).toEqual(rankedIds.map((row) => row.id));
    // Hydration must not re-introduce an id-ordered take of its own.
    expect(
      (hydrate?.args as { take?: number; orderBy?: unknown }).take,
    ).toBeUndefined();
  });

  it("hydrates only the SQL-ranked page when more than 200 ids would match", async () => {
    // Simulate the database already applying effective-time LIMIT: it returns
    // the newest 200 of a 250-row universe (ids 50..249), never the oldest.
    rankedIds = Array.from({ length: DEFAULT_CALENDAR_TAKE }, (_, i) => ({
      id: `id-${String(i + 50).padStart(4, "0")}`,
    }));
    pageRows = rankedIds.map((row) => ({ id: row.id }));

    const result = await listCalendarEvents({
      from: new Date("2024-01-01T00:00:00.000Z"),
      to: new Date("2026-12-31T23:59:59.000Z"),
    });

    expect(result).toHaveLength(DEFAULT_CALENDAR_TAKE);
    expect(result.map((e) => e.id)).toContain("id-0249");
    expect(result.map((e) => e.id)).not.toContain("id-0000");
    expect(result.map((e) => e.id)).not.toContain("id-0049");
  });
});
