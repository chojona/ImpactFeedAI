import { NextRequest, NextResponse } from "next/server";

import { isDatabaseConfigured } from "@/lib/prisma";
import { listEvents } from "@/services/events/eventQueries";
import { parseEventListQuery } from "@/services/events/queryParams";

/**
 * GET /api/events — filter / search / sort / paginate the event library.
 *
 * Reads Postgres. Previously served `src/lib/mock-data/events.ts`; the query
 * contract and response envelope were kept identical so the client did not
 * change with the data source.
 *
 * The handler stays thin on purpose: parse, delegate, shape. Validation and the
 * queries live in `src/services/events/eventQueries.ts` where they are testable
 * without a request.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = parseEventListQuery(searchParams);

  // A missing connection string is a deployment mistake, not an empty library.
  // Reporting it as 503 with a distinct code keeps it from rendering as "no
  // events match your search", which sent people looking for the wrong bug.
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      {
        error: "database_not_configured",
        message:
          "DATABASE_URL is not set. See .env.example — the event library is served from Postgres.",
      },
      { status: 503 },
    );
  }

  try {
    const result = await listEvents(query);
    return NextResponse.json(result);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[/api/events] query failed:", detail);
    return NextResponse.json(
      {
        error: "query_failed",
        message: "Could not read the event library.",
      },
      { status: 502 },
    );
  }
}
