import { NextRequest, NextResponse } from "next/server";

import { mockEvents } from "@/lib/mock-data/events";
import type { EventCategory, NewsEvent } from "@/types/events";

type SortMode = "newest" | "biggest";
type CategoryParam = EventCategory | "ALL";

const VALID_CATEGORIES: ReadonlySet<CategoryParam> = new Set<CategoryParam>([
  "ALL",
  "TARIFF",
  "FED",
  "INFLATION",
  "GEOPOLITICAL",
  "EARNINGS",
  "OTHER",
]);

const isCategory = (v: string | null): v is CategoryParam =>
  v !== null && VALID_CATEGORIES.has(v as CategoryParam);

const isSort = (v: string | null): v is SortMode =>
  v === "newest" || v === "biggest";

const maxAbsMove = (event: NewsEvent): number => {
  let m = 0;
  for (const a of event.assets) {
    const x = Math.abs(a.percentChange);
    if (x > m) m = x;
  }
  return m;
};

const parseNonNegativeInt = (
  raw: string | null,
  fallback: number,
  max?: number,
): number => {
  if (raw === null) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return fallback;
  if (max !== undefined && n > max) return max;
  return n;
};

export function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const offset = parseNonNegativeInt(searchParams.get("offset"), 0);
  const limit = parseNonNegativeInt(searchParams.get("limit"), 12, 100);

  const typeRaw = searchParams.get("type");
  const type: CategoryParam = isCategory(typeRaw) ? typeRaw : "ALL";

  const sortRaw = searchParams.get("sort");
  const sort: SortMode = isSort(sortRaw) ? sortRaw : "newest";

  const q = (searchParams.get("q") ?? "").toLowerCase().trim();

  const filtered = mockEvents.filter((e) => {
    if (type !== "ALL" && e.category !== type) return false;
    if (q.length > 0) {
      const hay = `${e.title} ${e.summary} ${e.explanation}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "newest") {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    }
    return maxAbsMove(b) - maxAbsMove(a);
  });

  const total = sorted.length;
  const events = sorted.slice(offset, offset + limit);

  const counts: Record<CategoryParam, number> = {
    ALL: mockEvents.length,
    TARIFF: 0,
    FED: 0,
    INFLATION: 0,
    GEOPOLITICAL: 0,
    EARNINGS: 0,
    OTHER: 0,
  };
  for (const e of mockEvents) {
    counts[e.category] += 1;
  }

  return NextResponse.json({
    events,
    total,
    offset,
    limit,
    counts,
  });
}