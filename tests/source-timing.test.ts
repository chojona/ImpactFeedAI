import { afterEach, describe, expect, it, vi } from "vitest";

import { yieldBlsEvents } from "../scripts/ingest/sources-bls";
import { yieldFomcEvents } from "../scripts/ingest/sources-fomc";
import { yieldFredEvents } from "../scripts/ingest/sources-fred";
import { easternWallClock } from "@/services/macro/time";

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const monthlyObservations = Array.from({ length: 14 }, (_, index) => {
  const date = new Date(Date.UTC(2023, index, 1));
  return {
    iso: date.toISOString().slice(0, 10),
    value: String(100 + index),
  };
});

async function collect<T>(generator: AsyncGenerator<T>): Promise<T[]> {
  const rows: T[] = [];
  for await (const row of generator) rows.push(row);
  return rows;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("bulk source timing semantics", () => {
  it("keeps the monthly reference period separate and creates the same FRED/BLS identity", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        const seriesId = url.searchParams.get("series_id");
        return jsonResponse({
          observations:
            seriesId === "CPIAUCNS"
              ? monthlyObservations.map(({ iso, value }) => ({
                  date: iso,
                  value,
                }))
              : [],
        });
      }),
    );
    const fredRows = await collect(
      yieldFredEvents({ apiKey: "test-key", since: "2024-01-01", log: () => {} }),
    );
    const fred = fredRows.find(
      (row) =>
        row.data.metricKey === "CPI_HEADLINE" &&
        row.data.referencePeriodStart?.toISOString().startsWith("2024-01-01"),
    );

    vi.unstubAllGlobals();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { seriesid: string[] };
        const seriesId = body.seriesid[0];
        return jsonResponse({
          status: "REQUEST_SUCCEEDED",
          message: [],
          Results: {
            series: [
              {
                seriesID: seriesId,
                data:
                  seriesId === "CUUR0000SA0"
                    ? monthlyObservations.map(({ iso, value }) => ({
                        year: iso.slice(0, 4),
                        period: `M${iso.slice(5, 7)}`,
                        periodName: "test month",
                        value,
                      }))
                    : [],
              },
            ],
          },
        });
      }),
    );
    const blsRows = await collect(
      yieldBlsEvents({ apiKey: undefined, since: "2024-01-01", log: () => {} }),
    );
    const bls = blsRows.find(
      (row) =>
        row.data.metricKey === "CPI_HEADLINE" &&
        row.data.referencePeriodStart?.toISOString().startsWith("2024-01-01"),
    );

    expect(fred).toBeDefined();
    expect(bls).toBeDefined();
    for (const row of [fred!, bls!]) {
      expect(row.occurredAt.toISOString()).toBe("2024-01-01T00:00:00.000Z");
      expect(row.data.referencePeriodStart?.toISOString()).toBe(
        "2024-01-01T00:00:00.000Z",
      );
      expect(row.releaseAt).toBeNull();
      expect(row.releaseDate).toBeNull();
      expect(row.timingStatus).toBe("REFERENCE_PERIOD_ONLY");
      expect(row.data.consensusStatus).toBe("MISSING");
    }

    // January 2024 CPI was published on Feb 13 at 08:30 ET. The series APIs
    // supply Jan 1 as the observation period, so the source must not pretend it
    // received the later market-moving instant.
    const scheduledRelease = easternWallClock("2024-02-13", 8, 30);
    expect(fred!.occurredAt.getTime()).not.toBe(scheduledRelease.getTime());
    expect(bls!.occurredAt.getTime()).not.toBe(scheduledRelease.getTime());
    expect(fred!.eventKey).toBe("macro:CPI_HEADLINE:initial:2024-01-01");
    expect(bls!.eventKey).toBe(fred!.eventKey);
  });

  it("does not shift a weekend FRED reference period or fabricate 08:30", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        return jsonResponse({
          observations:
            url.searchParams.get("series_id") === "FEDFUNDS"
              ? [{ date: "2025-06-01", value: "4.33" }]
              : [],
        });
      }),
    );

    const rows = await collect(
      yieldFredEvents({ apiKey: "test-key", since: "2025-06-01", log: () => {} }),
    );
    const row = rows.find(
      (candidate) => candidate.data.metricKey === "FED_FUNDS_EFFECTIVE",
    );

    expect(row).toBeDefined();
    expect(row!.occurredAt.toISOString()).toBe("2025-06-01T00:00:00.000Z");
    expect(row!.occurredAt.getUTCDay()).toBe(0);
    expect(row!.releaseAt).toBeNull();
    expect(row!.timingStatus).toBe("REFERENCE_PERIOD_ONLY");
  });

  it("marks DFEDTARU change timing as inferred and keys it by effective date", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          observations: [
            { date: "2024-11-07", value: "5.00" },
            { date: "2024-11-08", value: "4.75" },
            { date: "2024-11-09", value: "4.75" },
          ],
        }),
      ),
    );

    const rows = await collect(
      yieldFomcEvents({ apiKey: "test-key", since: "2024-11-07", log: () => {} }),
    );

    expect(rows).toHaveLength(1); // unchanged daily values are not meetings
    expect(rows[0].eventKey).toBe(
      "macro:FED_TARGET_UPPER:change:2024-11-08",
    );
    expect(rows[0].occurredAt.toISOString()).toBe("2024-11-07T19:00:00.000Z");
    expect(rows[0].releaseDate?.toISOString()).toBe(
      "2024-11-07T00:00:00.000Z",
    );
    expect(rows[0].releaseAt).toBeNull();
    expect(rows[0].timingStatus).toBe("INFERRED");
    expect(rows[0].data.referencePeriodStart).toBeNull();
    expect(rows[0].sourceUrl).toBe(
      "https://fred.stlouisfed.org/series/DFEDTARU",
    );
  });
});
