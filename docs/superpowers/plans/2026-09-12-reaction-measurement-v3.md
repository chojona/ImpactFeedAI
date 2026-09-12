# Reaction Measurement Contract v3 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the v2 reaction calculation — whose anchor is chosen by data availability and therefore mixes two incompatible window definitions in one column — with four explicitly-defined, internally homogeneous measures stored in a new additive table.

**Architecture:** A new `reaction_measurements` long table holds one fully-specified row per `event · symbol · measure · calculationVersion`. A measure's anchor is fixed by the measure, never by availability. `asset_reactions` is frozen as a read-only archive and is never modified. Work ships in four ordered stages so the read path never cuts over before rows exist.

**Tech Stack:** TypeScript 5 strict, Next.js 16 App Router, React 19, Prisma 7 + `@prisma/adapter-pg`, Postgres (Neon), Vitest, `yahoo-finance2` v3, Tailwind v4.

**Spec:** [`docs/superpowers/specs/2026-09-12-reaction-measurement-contract-design.md`](../specs/2026-09-12-reaction-measurement-contract-design.md)

## Global Constraints

- TypeScript `strict`, **no `any`**. Named exports for components. No default exports for components.
- `async`/`await` only — never raw `.then()` chains.
- Components under 150 lines; extract when longer.
- Tailwind only; inline styles only for dynamic values. Mobile-first.
- **A value that cannot be measured is `null`, NEVER `0`.** In v3 this strengthens: an unmeasurable window produces **no row at all**.
- Scripts build Prisma clients via `scripts/lib/prisma.ts` (`DIRECT_URL`). Dry-runs use `scripts/lib/readonly-prisma.ts`.
- Prisma 7 has **no zero-arg `PrismaClient` constructor** — an adapter is required.
- `src/` must **never** import from `scripts/`. `scripts/` imports `src/` via `@/`.
- Run `npm run db:generate` after any schema change, before `npm run typecheck`.
- `npm run verify` = typecheck + lint + test. It must pass at every commit boundary.
- Node `^22.12.0 || >=24.0.0`.
- **No new runtime dependencies.** `typescript-language-server` is global dev tooling only and must not appear in `package.json`.
- **User-facing labels are fixed:** `INTRADAY_60M` → "First hour"; `RELEASE_SESSION` → "Release session"; `SESSION_PLUS_1` → "Next session"; `SESSION_PLUS_5` → **"5 sessions"** (never "One week").
- `sessionBasis` badge labels: `RTH`, `FUT`, `24/7`. Full meaning lives in the Method block only.
- **Stage 1 must produce zero visible production behaviour change.** No file under `src/app/` or `src/components/` is touched in Stage 1.
- **Stage 3 is a production write and requires explicit user approval. Never run it unprompted.**

---

## Blocking decisions before Task 1

Two items in spec §15 reversed or extended approved requirements. **Both are now approved** (2026-09-12):

- **§15.1 — APPROVED.** `getLibrarySummary` (`eventQueries.ts:542`) is in the Stage 4 cutover set (Task 24). Its `measuredEvents` count must derive from `reaction_measurements` at `measure = 'RELEASE_SESSION'` and the current calculation version — identical predicate to every other headline-measure count, so it cannot drift from `getLibraryCoverage`.
- **§15.2 — APPROVED, with a precise invariant.** *Within one `ReactionMeasurement` row, anchor and endpoint must share a declared `PriceBasis`; different measures for the same instrument may legitimately use different bases from each other.* `INTRADAY_60M` uses intraday `AS_TRADED` for both sides; the three session measures use daily `SPLIT_ADJUSTED` for both sides. An instrument is never rejected merely because its intraday and daily series carry different bases — that is now an expected permanent fact about the provider. The old cross-series ratio check is demoted to a reported diagnostic (Task 8). A measurement that would combine two different bases within itself remains a hard failure — enforced at the type level and re-checked in verification (Task 11).
- **`maxAbsMove` (`mapEvent.ts:238`)** — no production caller today, only tests. **Ported** to the v3 measure representation in Task 16, not deleted. Dead-code cleanup is out of scope for this migration.

---

## File structure

### Stage 1 — created

| File | Responsibility |
| --- | --- |
| `src/services/events/reactionMeasures.ts` | The four measures, labels, descriptions, headline selection. Pure, no I/O. |
| `src/services/market/sessionCalendar.ts` | Canonical US-equity calendar: trading days from a reference series, DST-correct closes, the isolated early-close table, supported range, fail-closed ambiguity rule. Pure. |
| `src/services/market/sessionBasis.ts` | Per-symbol `sessionBasis` declaration + declared native closes. Fail-closed for undeclared symbols. Pure. |
| `src/services/events/reactionMeasurement.ts` | The calculation engine: resolves all four measures from an intraday series, a daily series and a calendar. Pure. |
| `scripts/ingest/measurement-provider.ts` | Yahoo adapter → the engine's series inputs, with declared `PriceBasis`. |
| `scripts/backfill/backfill-reaction-measurements.ts` | Dry-run-default, resumable, idempotent, additive writer. |
| `scripts/maintenance/verify-reaction-measurements.ts` | Invariant + coverage verification, branched by measure family. |
| `prisma/migrations/<ts>_add_reaction_measurements/migration.sql` | DDL only. |
| `tests/sessionCalendar.test.ts`, `tests/sessionBasis.test.ts`, `tests/reactionMeasurement.test.ts`, `tests/reactionMeasures.test.ts` | Stage 1 unit tests. |

### Stage 1 — modified

| File | Change |
| --- | --- |
| `prisma/schema.prisma` | 3 enums + `ReactionMeasurement` model + `Event` relation. |
| `src/services/events/timing.ts` | `CURRENT_REACTION_CALCULATION_VERSION` → 3; add `ARCHIVED_ASSET_REACTION_VERSION = 2`. |
| `src/services/events/reactionRepair.ts` | Rebind to `ARCHIVED_ASSET_REACTION_VERSION`. |
| `scripts/maintenance/repair-reaction-timing.ts` | Rebind; redirect recompute guidance. |
| `src/services/analytics/patternAnalysis.ts:65` | Rebind the v2 archive filter (still reads v2 until Stage 4). |
| `src/services/events/mapEvent.ts:119,206` | Rebind to `ARCHIVED_ASSET_REACTION_VERSION`. |
| `src/services/events/eventQueries.ts` (6 sites) | Rebind to `ARCHIVED_ASSET_REACTION_VERSION`. |
| `package.json` | 4 new scripts. |
| `tests/reactionRepair.test.ts`, `tests/mapEvent.test.ts`, `tests/patternAnalysis.test.ts`, `tests/eventQueries.test.ts`, `tests/fetch-prices.test.ts` | Rebind version constant. |

> **Why Stage 1 touches read-path files:** only to swap which *constant* they name. Behaviour is byte-identical — they continue to select v2 rows. This is what keeps the version bump from turning archive rows into deletion candidates.

### Stage 4 — modified

`src/types/events.ts`, `src/services/events/mapEvent.ts`, `src/services/events/eventQueries.ts`, `src/services/events/reactionView.ts`, `src/services/events/reactionChart.ts`, `src/services/analytics/patternAnalysis.ts`, `src/app/api/events/route.ts`, `src/app/events/[id]/page.tsx`, `src/app/patterns/page.tsx`, `src/components/events/EventReactionSummary.tsx`, `src/components/events/EventCard.tsx`, `src/components/reactions/{ReactionChart,ReactionSummaryTable,CrossAssetReactionBars,MiniReactionBars,EventReactionExplorer,HorizonSelector}.tsx`, `src/components/patterns/{HorizonMatrix,ReactionDistribution,EventInHistory}.tsx`, `src/components/landing/{LibraryStats,LivePreviewPanel}.tsx`, plus a new `src/components/reactions/SessionBasisBadge.tsx`.

LSP reference counts driving this list: `ReactionWindow` — 65 refs / 17 files; `AssetReaction` (view type) — 52 refs / 14 files; `CURRENT_REACTION_CALCULATION_VERSION` — 34 refs / 13 files.

---

# STAGE 1 — Additive infrastructure

Safe to merge. Zero visible production change.

### Task 1: Measure vocabulary

**Files:**
- Create: `src/services/events/reactionMeasures.ts`
- Test: `tests/reactionMeasures.test.ts`

**Interfaces:**
- Produces: `ReactionMeasure`, `REACTION_MEASURES`, `HEADLINE_MEASURE`, `MEASURE_LABELS`, `MEASURE_DESCRIPTIONS`, `MEASURE_FAMILY`, `measureFamily()`, `sessionOffsetFor()`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import {
  HEADLINE_MEASURE,
  MEASURE_LABELS,
  REACTION_MEASURES,
  measureFamily,
  sessionOffsetFor,
} from "@/services/events/reactionMeasures";

describe("reaction measures", () => {
  it("declares exactly the four contracted measures", () => {
    expect(REACTION_MEASURES).toEqual([
      "INTRADAY_60M",
      "RELEASE_SESSION",
      "SESSION_PLUS_1",
      "SESSION_PLUS_5",
    ]);
  });

  it("headlines the release session", () => {
    expect(HEADLINE_MEASURE).toBe("RELEASE_SESSION");
  });

  it("labels SESSION_PLUS_5 as '5 sessions', never 'One week'", () => {
    expect(MEASURE_LABELS.SESSION_PLUS_5).toBe("5 sessions");
    for (const label of Object.values(MEASURE_LABELS)) {
      expect(label).not.toMatch(/one week/i);
    }
  });

  it("splits the measures into two families", () => {
    expect(measureFamily("INTRADAY_60M")).toBe("INTRADAY");
    expect(measureFamily("RELEASE_SESSION")).toBe("SESSION");
    expect(measureFamily("SESSION_PLUS_5")).toBe("SESSION");
  });

  it("maps session measures to their offset and intraday to null", () => {
    expect(sessionOffsetFor("RELEASE_SESSION")).toBe(0);
    expect(sessionOffsetFor("SESSION_PLUS_1")).toBe(1);
    expect(sessionOffsetFor("SESSION_PLUS_5")).toBe(5);
    expect(sessionOffsetFor("INTRADAY_60M")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/reactionMeasures.test.ts`
Expected: FAIL — `Cannot find module '@/services/events/reactionMeasures'`

- [ ] **Step 3: Write minimal implementation**

```typescript
/**
 * The four standardized reaction measures.
 *
 * A measure's anchor is fixed by the measure, never by what data happened to be
 * available. That is the property that makes two values stored under the same
 * measure comparable — see the spec, §2.
 */
export type ReactionMeasure =
  | "INTRADAY_60M"
  | "RELEASE_SESSION"
  | "SESSION_PLUS_1"
  | "SESSION_PLUS_5";

export const REACTION_MEASURES: readonly ReactionMeasure[] = [
  "INTRADAY_60M",
  "RELEASE_SESSION",
  "SESSION_PLUS_1",
  "SESSION_PLUS_5",
];

/**
 * The measure the product headlines. `RELEASE_SESSION` has the broadest
 * historical coverage (daily bars extend decades; intraday does not) and a
 * standardized one-session exposure. It is NOT the temporally tightest measure
 * — `INTRADAY_60M` is, where it exists.
 */
export const HEADLINE_MEASURE: ReactionMeasure = "RELEASE_SESSION";

export type MeasureFamily = "INTRADAY" | "SESSION";

const FAMILY: Readonly<Record<ReactionMeasure, MeasureFamily>> = {
  INTRADAY_60M: "INTRADAY",
  RELEASE_SESSION: "SESSION",
  SESSION_PLUS_1: "SESSION",
  SESSION_PLUS_5: "SESSION",
};

export const measureFamily = (measure: ReactionMeasure): MeasureFamily =>
  FAMILY[measure];

/** Sessions after the release session. Null for the intraday family. */
const SESSION_OFFSET: Readonly<Record<ReactionMeasure, number | null>> = {
  INTRADAY_60M: null,
  RELEASE_SESSION: 0,
  SESSION_PLUS_1: 1,
  SESSION_PLUS_5: 5,
};

export const sessionOffsetFor = (measure: ReactionMeasure): number | null =>
  SESSION_OFFSET[measure];

/**
 * "One week" is deliberately not used for SESSION_PLUS_5: five sessions is
 * seven calendar days only when no holiday intervenes.
 */
export const MEASURE_LABELS: Readonly<Record<ReactionMeasure, string>> = {
  INTRADAY_60M: "First hour",
  RELEASE_SESSION: "Release session",
  SESSION_PLUS_1: "Next session",
  SESSION_PLUS_5: "5 sessions",
};

export const MEASURE_DESCRIPTIONS: Readonly<Record<ReactionMeasure, string>> = {
  INTRADAY_60M: "60 minutes after the release instant",
  RELEASE_SESSION:
    "Prior session close to the close of the session containing the release",
  SESSION_PLUS_1: "Prior session close to the close of the following session",
  SESSION_PLUS_5: "Prior session close to the close five sessions later",
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/reactionMeasures.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/events/reactionMeasures.ts tests/reactionMeasures.test.ts
git commit -m "feat(reactions): declare the four v3 reaction measures"
```

---

### Task 2: Session basis declaration (fail-closed)

**Files:**
- Create: `src/services/market/sessionBasis.ts`
- Test: `tests/sessionBasis.test.ts`

**Interfaces:**
- Produces: `SessionBasis`, `sessionBasisFor(symbol): SessionBasis | null`, `nativeCloseMinuteFor(basis, isEarlyClose): number`, `SESSION_BASIS_BADGE`, `SESSION_BASIS_MEANING`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import {
  SESSION_BASIS_BADGE,
  SESSION_BASIS_MEANING,
  nativeCloseMinuteFor,
  sessionBasisFor,
} from "@/services/market/sessionBasis";

describe("sessionBasisFor", () => {
  it("declares the equity ETFs as US regular hours", () => {
    for (const s of ["SPY", "QQQ", "IWM", "TLT", "GLD", "XLK", "XLF", "XLE"]) {
      expect(sessionBasisFor(s)).toBe("US_EQUITY_RTH");
    }
  });

  it("declares the futures instruments as extended", () => {
    for (const s of ["CL=F", "GC=F", "DX-Y.NYB"]) {
      expect(sessionBasisFor(s)).toBe("EXTENDED_FUTURES");
    }
  });

  it("declares bitcoin as continuous", () => {
    expect(sessionBasisFor("BTC-USD")).toBe("CONTINUOUS_24_7");
  });

  it("fails closed for an undeclared symbol", () => {
    // Never defaults to US_EQUITY_RTH: that would assign a session structure
    // nobody verified.
    expect(sessionBasisFor("NVDA")).toBeNull();
    expect(sessionBasisFor("")).toBeNull();
  });
});

describe("nativeCloseMinuteFor", () => {
  it("uses 16:00 ET for equities and 13:00 on an early close", () => {
    expect(nativeCloseMinuteFor("US_EQUITY_RTH", false)).toBe(16 * 60);
    expect(nativeCloseMinuteFor("US_EQUITY_RTH", true)).toBe(13 * 60);
  });

  it("uses declared native closes for the other bases", () => {
    expect(nativeCloseMinuteFor("EXTENDED_FUTURES", false)).toBe(17 * 60);
    expect(nativeCloseMinuteFor("CONTINUOUS_24_7", false)).toBe(19 * 60);
  });
});

describe("badge and meaning", () => {
  it("keeps badges terse and meanings full", () => {
    expect(SESSION_BASIS_BADGE.US_EQUITY_RTH).toBe("RTH");
    expect(SESSION_BASIS_BADGE.EXTENDED_FUTURES).toBe("FUT");
    expect(SESSION_BASIS_BADGE.CONTINUOUS_24_7).toBe("24/7");
    expect(SESSION_BASIS_MEANING.CONTINUOUS_24_7).toMatch(/continuous/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sessionBasis.test.ts`
Expected: FAIL — `Cannot find module '@/services/market/sessionBasis'`

- [ ] **Step 3: Write minimal implementation**

```typescript
/**
 * Declared session structure per instrument.
 *
 * The canonical calendar (see `sessionCalendar.ts`) decides WHICH dates a
 * measurement spans; this module records how much tradeable time an instrument
 * actually has inside those dates. Recording it is what stops a cross-asset
 * comparison from implying every SESSION_* value covers the same trading hours.
 *
 * Native close times here are DECLARED APPROXIMATIONS used for exactly one
 * purpose: the anchor-validity guard. They are never used to timestamp a price
 * and are never rendered as precision.
 */

/** Mirrors the Prisma `SessionBasis` enum exactly. */
export type SessionBasis =
  | "US_EQUITY_RTH"
  | "EXTENDED_FUTURES"
  | "CONTINUOUS_24_7";

const DECLARED: Readonly<Record<string, SessionBasis>> = {
  SPY: "US_EQUITY_RTH",
  QQQ: "US_EQUITY_RTH",
  IWM: "US_EQUITY_RTH",
  TLT: "US_EQUITY_RTH",
  GLD: "US_EQUITY_RTH",
  XLK: "US_EQUITY_RTH",
  XLF: "US_EQUITY_RTH",
  XLE: "US_EQUITY_RTH",
  "CL=F": "EXTENDED_FUTURES",
  "GC=F": "EXTENDED_FUTURES",
  "DX-Y.NYB": "EXTENDED_FUTURES",
  "BTC-USD": "CONTINUOUS_24_7",
};

/**
 * Null for an undeclared symbol. Callers must produce no measurement rather
 * than defaulting — an unverified session structure is exactly the silent
 * assumption this contract exists to remove.
 */
export const sessionBasisFor = (symbol: string): SessionBasis | null =>
  DECLARED[symbol] ?? null;

const REGULAR_CLOSE_MINUTE = 16 * 60;
const EARLY_CLOSE_MINUTE = 13 * 60;

/** Minutes past midnight US/Eastern at which this basis stops trading. */
export function nativeCloseMinuteFor(
  basis: SessionBasis,
  isEarlyClose: boolean,
): number {
  switch (basis) {
    case "US_EQUITY_RTH":
      return isEarlyClose ? EARLY_CLOSE_MINUTE : REGULAR_CLOSE_MINUTE;
    case "EXTENDED_FUTURES":
      return 17 * 60;
    case "CONTINUOUS_24_7":
      // Yahoo stamps BTC daily bars on UTC days, so the bar dated D closes at
      // UTC midnight — 19:00 EST / 20:00 EDT. 19:00 is the conservative choice
      // for a strictly-before guard.
      return 19 * 60;
  }
}

export const SESSION_BASIS_BADGE: Readonly<Record<SessionBasis, string>> = {
  US_EQUITY_RTH: "RTH",
  EXTENDED_FUTURES: "FUT",
  CONTINUOUS_24_7: "24/7",
};

export const SESSION_BASIS_MEANING: Readonly<Record<SessionBasis, string>> = {
  US_EQUITY_RTH:
    "US equity regular hours — 09:30–16:00 ET, about 6.5 tradeable hours per session.",
  EXTENDED_FUTURES:
    "Extended futures session — a CME/ICE trading day of roughly 23 hours.",
  CONTINUOUS_24_7:
    "Continuous 24/7 trading — the provider's day is a UTC calendar day.",
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sessionBasis.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/market/sessionBasis.ts tests/sessionBasis.test.ts
git commit -m "feat(market): declare per-instrument session basis, fail-closed"
```

---

### Task 3: Canonical session calendar — trading days and closes

**Files:**
- Create: `src/services/market/sessionCalendar.ts`
- Test: `tests/sessionCalendar.test.ts`

**Interfaces:**
- Consumes: `easternWallClock` from `@/services/macro/time`
- Produces: `SessionCalendar`, `buildSessionCalendar(referenceDays: readonly string[])`, `calendar.sessionDays`, `calendar.indexOf(day)`, `calendar.dayAt(index)`, `calendar.closeInstant(day)`, `calendar.isEarlyClose(day)`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { buildSessionCalendar } from "@/services/market/sessionCalendar";

// Real SPY session days around the 2025 Independence Day early close.
const DAYS = [
  "2025-06-30", "2025-07-01", "2025-07-02", "2025-07-03",
  // 2025-07-04 is a holiday — absent, so it is not a session.
  "2025-07-07", "2025-07-08", "2025-07-09", "2025-07-10", "2025-07-11",
];

describe("buildSessionCalendar", () => {
  const cal = buildSessionCalendar(DAYS);

  it("treats a date with no reference bar as a non-session", () => {
    expect(cal.indexOf("2025-07-04")).toBeNull();
    expect(cal.indexOf("2025-07-03")).toBe(3);
  });

  it("walks sessions by ordinal, skipping holidays", () => {
    expect(cal.dayAt(cal.indexOf("2025-07-03")! + 1)).toBe("2025-07-07");
  });

  it("returns null past the end of the series rather than extrapolating", () => {
    expect(cal.dayAt(DAYS.length)).toBeNull();
    expect(cal.dayAt(-1)).toBeNull();
  });

  it("resolves a regular close at 16:00 ET, DST-correct", () => {
    // 2025-07-03 is EDT (UTC-4): 16:00 ET = 20:00Z.
    expect(cal.closeInstant("2025-07-03")).toEqual(
      new Date("2025-07-03T20:00:00Z"),
    );
  });

  it("resolves an early close at 13:00 ET from the table", () => {
    expect(cal.isEarlyClose("2025-07-03")).toBe(true);
    expect(cal.closeInstant("2025-07-03", { honourEarlyClose: true })).toEqual(
      new Date("2025-07-03T17:00:00Z"),
    );
  });

  it("is DST-correct in winter", () => {
    const winter = buildSessionCalendar(["2025-01-15"]);
    // EST (UTC-5): 16:00 ET = 21:00Z.
    expect(winter.closeInstant("2025-01-15")).toEqual(
      new Date("2025-01-15T21:00:00Z"),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sessionCalendar.test.ts`
Expected: FAIL — `Cannot find module '@/services/market/sessionCalendar'`

- [ ] **Step 3: Write minimal implementation**

```typescript
/**
 * The canonical US-equity session calendar.
 *
 * Trading days come from the reference instrument's own daily series, so the
 * calendar cannot drift from the prices measured over it and holidays need no
 * external dataset: a date with no reference bar is not a session.
 *
 * Close times are resolved through `easternWallClock`, which is DST-correct by
 * construction. A hardcoded UTC offset is never used.
 *
 * The early-close table is isolated here and exposed only through this API, so
 * no caller can consult a raw date list or bypass the supported-range check.
 *
 * Source: NYSE holiday and hours calendar,
 * https://www.nyse.com/markets/hours-calendars (retrieved 2026-09-12).
 */
import { easternWallClock } from "@/services/macro/time";

/** Inclusive bounds of the curated early-close table. */
export const EARLY_CLOSE_RANGE_START = "2022-01-01";
export const EARLY_CLOSE_RANGE_END = "2026-12-31";

/** 13:00 ET closes. Extend together with EARLY_CLOSE_RANGE_END. */
const EARLY_CLOSE_DAYS: ReadonlySet<string> = new Set([
  "2022-07-01", "2022-11-25", "2022-12-23",
  "2023-07-03", "2023-11-24",
  "2024-07-03", "2024-11-29", "2024-12-24",
  "2025-07-03", "2025-11-28", "2025-12-24",
  "2026-07-02", "2026-11-27", "2026-12-24",
]);

const REGULAR_CLOSE_HOUR = 16;
const EARLY_CLOSE_HOUR = 13;

export interface CloseOptions {
  /** When true, a listed early-close day resolves to 13:00 ET. */
  honourEarlyClose?: boolean;
}

export interface SessionCalendar {
  readonly sessionDays: readonly string[];
  /** Ordinal of a session day, or null when the date is not a session. */
  indexOf(day: string): number | null;
  /** Session day at an ordinal, or null when out of range. Never extrapolates. */
  dayAt(index: number): string | null;
  isEarlyClose(day: string): boolean;
  /** Whether `day` sits inside the curated early-close range. */
  earlyCloseKnown(day: string): boolean;
  closeInstant(day: string, options?: CloseOptions): Date;
}

export function buildSessionCalendar(
  referenceDays: readonly string[],
): SessionCalendar {
  const sessionDays = [...new Set(referenceDays)].sort();
  const ordinals = new Map(sessionDays.map((day, index) => [day, index]));

  return {
    sessionDays,
    indexOf: (day) => ordinals.get(day) ?? null,
    dayAt: (index) =>
      index >= 0 && index < sessionDays.length ? sessionDays[index] : null,
    isEarlyClose: (day) => EARLY_CLOSE_DAYS.has(day),
    earlyCloseKnown: (day) =>
      day >= EARLY_CLOSE_RANGE_START && day <= EARLY_CLOSE_RANGE_END,
    closeInstant: (day, options) =>
      easternWallClock(
        day,
        options?.honourEarlyClose === true && EARLY_CLOSE_DAYS.has(day)
          ? EARLY_CLOSE_HOUR
          : REGULAR_CLOSE_HOUR,
        0,
      ),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sessionCalendar.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/market/sessionCalendar.ts tests/sessionCalendar.test.ts
git commit -m "feat(market): canonical session calendar with isolated early-close table"
```

---

### Task 4: Release-session resolution with the fail-closed ambiguity rule

**Files:**
- Modify: `src/services/market/sessionCalendar.ts`
- Test: `tests/sessionCalendar.test.ts`

**Interfaces:**
- Produces: `resolveReleaseSession(calendar, releaseAt): ReleaseSessionResolution`
- Result: `{ status: "resolved"; day: string; index: number } | { status: "refused"; reason: "no_session_after_release" | "early_close_unknown" }`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import {
  buildSessionCalendar,
  resolveReleaseSession,
} from "@/services/market/sessionCalendar";

const WEEK = [
  "2025-03-06", "2025-03-07",
  // 2025-03-08 Sat, 2025-03-09 Sun (DST starts) — not sessions.
  "2025-03-10", "2025-03-11", "2025-03-12",
];
const cal = buildSessionCalendar(WEEK);

const resolved = (at: string) => {
  const r = resolveReleaseSession(cal, new Date(at));
  if (r.status !== "resolved") throw new Error(`refused: ${r.reason}`);
  return r.day;
};

describe("resolveReleaseSession", () => {
  it("assigns a pre-market release to the same session", () => {
    // 08:30 EST on Mar 7 = 13:30Z.
    expect(resolved("2025-03-07T13:30:00Z")).toBe("2025-03-07");
  });

  it("assigns an intra-session release to the same session", () => {
    // 14:00 EST = 19:00Z, before the 21:00Z close.
    expect(resolved("2025-03-07T19:00:00Z")).toBe("2025-03-07");
  });

  it("assigns an after-hours release to the next session", () => {
    // 16:20 EST = 21:20Z, after the 21:00Z close.
    expect(resolved("2025-03-07T21:20:00Z")).toBe("2025-03-10");
  });

  it("assigns a release one millisecond after the close to the next session", () => {
    expect(resolved("2025-03-07T21:00:00.001Z")).toBe("2025-03-10");
  });

  it("assigns a release exactly at the close to the next session", () => {
    // Strictly-after means the closing instant belongs to the session that just
    // ended, so the release belongs to the following one.
    expect(resolved("2025-03-07T21:00:00.000Z")).toBe("2025-03-10");
  });

  it("assigns a weekend release to the next session, across DST", () => {
    // Sat Mar 8 00:01 EST = 05:01Z. Monday Mar 10 is EDT.
    expect(resolved("2025-03-08T05:01:00Z")).toBe("2025-03-10");
  });

  it("skips a holiday", () => {
    const holidayWeek = buildSessionCalendar([
      "2025-07-03", "2025-07-07",
    ]);
    // Fri Jul 4 is absent from the reference series.
    expect(
      resolveReleaseSession(holidayWeek, new Date("2025-07-04T12:30:00Z")),
    ).toMatchObject({ status: "resolved", day: "2025-07-07" });
  });

  it("refuses when no session closes after the release", () => {
    expect(
      resolveReleaseSession(cal, new Date("2025-12-31T12:30:00Z")),
    ).toMatchObject({ status: "refused", reason: "no_session_after_release" });
  });

  it("refuses an ambiguity-window release outside the early-close range", () => {
    // 14:00 ET on 2021-11-26 sits in [13:00, 16:00) and predates the table.
    const old = buildSessionCalendar(["2021-11-26", "2021-11-29"]);
    expect(
      resolveReleaseSession(old, new Date("2021-11-26T19:00:00Z")),
    ).toMatchObject({ status: "refused", reason: "early_close_unknown" });
  });

  it("proceeds outside the ambiguity window even out of range", () => {
    // 08:30 ET: neither a 13:00 nor a 16:00 close has passed, so the
    // early-close status cannot change the answer.
    const old = buildSessionCalendar(["2021-11-26", "2021-11-29"]);
    expect(
      resolveReleaseSession(old, new Date("2021-11-26T13:30:00Z")),
    ).toMatchObject({ status: "resolved", day: "2021-11-26" });
  });

  it("uses the early close when the date is covered", () => {
    // 2025-07-03 closes at 13:00 ET = 17:00Z; a 14:00 ET release is after it.
    const cal2 = buildSessionCalendar(["2025-07-03", "2025-07-07"]);
    expect(
      resolveReleaseSession(cal2, new Date("2025-07-03T18:00:00Z")),
    ).toMatchObject({ status: "resolved", day: "2025-07-07" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sessionCalendar.test.ts`
Expected: FAIL — `resolveReleaseSession is not a function`

- [ ] **Step 3: Write minimal implementation**

Append to `src/services/market/sessionCalendar.ts`:

```typescript
import { newYorkMinuteOfDay } from "@/services/market/sessionCalendar.internal";

/** Minutes past ET midnight bounding the window where an early close matters. */
const AMBIGUITY_START_MINUTE = 13 * 60;
const AMBIGUITY_END_MINUTE = 16 * 60;

export type ReleaseSessionRefusal =
  | "no_session_after_release"
  | "early_close_unknown";

export type ReleaseSessionResolution =
  | { status: "resolved"; day: string; index: number }
  | { status: "refused"; reason: ReleaseSessionRefusal };

/**
 * The release session: the first canonical session whose CLOSE is strictly
 * after `releaseAt`.
 *
 * A release timestamped exactly at a close therefore belongs to the FOLLOWING
 * session — the closing instant belongs to the session that just ended.
 *
 * An early close can only change the answer for a release in [13:00, 16:00) ET:
 * before 13:00 neither close has passed, at or after 16:00 both have. Inside
 * that window on a date the curated table does not cover, this refuses rather
 * than assuming a normal 16:00 close.
 */
export function resolveReleaseSession(
  calendar: SessionCalendar,
  releaseAt: Date,
): ReleaseSessionResolution {
  if (!Number.isFinite(releaseAt.getTime())) {
    return { status: "refused", reason: "no_session_after_release" };
  }

  const minute = newYorkMinuteOfDay(releaseAt);
  const inAmbiguityWindow =
    minute >= AMBIGUITY_START_MINUTE && minute < AMBIGUITY_END_MINUTE;

  for (let index = 0; index < calendar.sessionDays.length; index += 1) {
    const day = calendar.sessionDays[index];
    if (inAmbiguityWindow && !calendar.earlyCloseKnown(day)) {
      return { status: "refused", reason: "early_close_unknown" };
    }
    const close = calendar.closeInstant(day, { honourEarlyClose: true });
    if (close.getTime() > releaseAt.getTime()) {
      return { status: "resolved", day, index };
    }
  }
  return { status: "refused", reason: "no_session_after_release" };
}
```

Create `src/services/market/sessionCalendar.internal.ts`:

```typescript
/**
 * Minutes past midnight in America/New_York for an instant.
 *
 * `scripts/ingest/candle-semantics.ts` has an equivalent helper, but `src/`
 * must never import from `scripts/`, so the primitive is restated here rather
 * than inverting the dependency direction.
 */
const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour12: false,
  hour: "2-digit",
  minute: "2-digit",
});

export function newYorkMinuteOfDay(date: Date): number {
  const parts = formatter.formatToParts(date);
  const read = (type: "hour" | "minute"): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  // Intl can emit hour 24 for midnight under hour12:false.
  return (read("hour") % 24) * 60 + read("minute");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sessionCalendar.test.ts`
Expected: PASS (17 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/market/sessionCalendar.ts src/services/market/sessionCalendar.internal.ts tests/sessionCalendar.test.ts
git commit -m "feat(market): release-session resolution with fail-closed early-close rule"
```

---

### Task 5: Prisma schema, enums and migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_reaction_measurements/migration.sql`

**Interfaces:**
- Produces: Prisma model `ReactionMeasurement`; enums `ReactionMeasure`, `ReactionAnchorKind`, `SessionBasis`

- [ ] **Step 1: Add the enums and model to `prisma/schema.prisma`**

Append the three enums and the model exactly as specified in spec §5, and add
`reactionMeasurements ReactionMeasurement[]` to the `Event` model. Do **not**
alter `AssetReaction` in any way.

- [ ] **Step 2: Verify the schema parses**

Run: `npm run db:validate`
Expected: `The schema at prisma/schema.prisma is valid`

- [ ] **Step 3: Generate the migration without applying it**

Run: `npx prisma migrate dev --name add_reaction_measurements --create-only`
Expected: a new folder under `prisma/migrations/`

- [ ] **Step 4: Inspect the generated SQL**

Run: `cat prisma/migrations/*_add_reaction_measurements/migration.sql`
Expected — and this is the gate — the file contains **only**:
- `CREATE TYPE "ReactionMeasure"`, `CREATE TYPE "ReactionAnchorKind"`, `CREATE TYPE "SessionBasis"`
- `CREATE TABLE "reaction_measurements"`
- `CREATE UNIQUE INDEX`/`CREATE INDEX` on that table
- one `ALTER TABLE "reaction_measurements" ADD CONSTRAINT ... FOREIGN KEY`

It must contain **no** `ALTER TABLE "asset_reactions"`, no `UPDATE`, no `DROP`.
If it does, stop and re-derive the schema change.

- [ ] **Step 5: Regenerate the client and typecheck**

Run: `npm run db:generate && npm run typecheck`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add reaction_measurements table, additive DDL only"
```

---

### Task 6: Archive-version decoupling (the deletion-candidate trap)

**Files:**
- Modify: `src/services/events/timing.ts:13`
- Modify: `src/services/events/reactionRepair.ts:2,43`
- Modify: `scripts/maintenance/repair-reaction-timing.ts:28,109`
- Modify: `src/services/events/mapEvent.ts:23,119,206`
- Modify: `src/services/events/eventQueries.ts:39,144,313,326,420,542,579`
- Modify: `src/services/analytics/patternAnalysis.ts:8,65`
- Modify: `scripts/ingest/compute-reactions.ts:2,27`
- Test: `tests/reactionRepair.test.ts`

**Interfaces:**
- Produces: `ARCHIVED_ASSET_REACTION_VERSION = 2`; `CURRENT_REACTION_CALCULATION_VERSION = 3`

- [ ] **Step 1: Write the failing regression test**

Add to `tests/reactionRepair.test.ts`:

```typescript
import {
  ARCHIVED_ASSET_REACTION_VERSION,
  CURRENT_REACTION_CALCULATION_VERSION,
} from "@/services/events/timing";

describe("v2 archive rows survive the v3 version bump", () => {
  it("separates the archive version from the current version", () => {
    expect(ARCHIVED_ASSET_REACTION_VERSION).toBe(2);
    expect(CURRENT_REACTION_CALCULATION_VERSION).toBe(3);
  });

  it("does not mark a v2 archive row as a deletion candidate", () => {
    // The whole point: bumping the current version to 3 must not turn 240 rows
    // of valuable production history into repair-script deletion candidates.
    const plan = planReactionRepair({
      releaseAt: new Date("2025-07-03T12:30:00Z"),
      timingStatus: "SCHEDULED",
      timingSource: "BLS Employment Situation release schedule",
      reactions: [{ id: "r1", assetSymbol: "SPY", calculationVersion: 2 }],
    });
    expect(plan.deleteRows).toEqual([]);
    expect(plan.reason).toBeNull();
    expect(plan.recomputeAfterDelete).toBe(false);
  });

  it("still marks a genuinely pre-versioning row as legacy", () => {
    const plan = planReactionRepair({
      releaseAt: new Date("2025-07-03T12:30:00Z"),
      timingStatus: "SCHEDULED",
      timingSource: "BLS Employment Situation release schedule",
      reactions: [{ id: "r0", assetSymbol: "SPY", calculationVersion: null }],
    });
    expect(plan.deleteRows).toHaveLength(1);
    expect(plan.reason).toBe("legacy_calculation");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/reactionRepair.test.ts`
Expected: FAIL — `ARCHIVED_ASSET_REACTION_VERSION` is not exported

- [ ] **Step 3: Write minimal implementation**

In `src/services/events/timing.ts`:

```typescript
/**
 * Semantics of the rows in `asset_reactions`, which is now a FROZEN ARCHIVE.
 *
 * `asset_reactions` is never written, updated or deleted again. It is read only
 * by the pre-cutover read path and by the repair tooling, both of which must
 * pin to this constant rather than to the current version — otherwise raising
 * the current version to 3 would reclassify every surviving v2 row as a
 * deletion candidate and offer to destroy the library's measurement history.
 */
export const ARCHIVED_ASSET_REACTION_VERSION = 2;

/**
 * Semantics of the rows in `reaction_measurements`. Read paths discard rows
 * whose version is not current.
 *
 * Version 3: four explicitly-defined measures; a measure's anchor is fixed by
 * the measure rather than by data availability; session measures are
 * close-to-close on the canonical US-equity calendar.
 */
export const CURRENT_REACTION_CALCULATION_VERSION = 3;
```

Then rebind every v2-reading site to `ARCHIVED_ASSET_REACTION_VERSION`:
`reactionRepair.ts:43`, `repair-reaction-timing.ts:28,109`, `mapEvent.ts:119,206`,
`eventQueries.ts:144,313,326,420,542,579`, `patternAnalysis.ts:65`,
`compute-reactions.ts:27`. Behaviour must be byte-identical — every one of these
continues to select v2 rows.

In `repair-reaction-timing.ts`, change the recompute guidance from
`backfill:prices` to `backfill:reaction-measurements`.

- [ ] **Step 4: Run the full suite to verify nothing changed**

Run: `npm run verify`
Expected: PASS — 412 existing tests plus the 3 new ones, all green. Any failure
here means a site was rebound incorrectly and behaviour drifted.

- [ ] **Step 5: Verify no production read path changed**

Run: `git diff --stat src/app src/components`
Expected: **empty output.** Stage 1 must not touch the UI.

- [ ] **Step 6: Commit**

```bash
git add src/services scripts tests
git commit -m "refactor(reactions): freeze asset_reactions as v2 archive, bump current to v3"
```

---

### Task 7: The calculation engine — session family

**Files:**
- Create: `src/services/events/reactionMeasurement.ts`
- Test: `tests/reactionMeasurement.test.ts`

**Interfaces:**
- Consumes: `SessionCalendar`, `resolveReleaseSession`, `sessionBasisFor`, `nativeCloseMinuteFor`, `sessionOffsetFor`
- Produces: `DailyBar`, `IntradayBar`, `MeasurementInput`, `ResolvedMeasurement`, `MeasurementOutcome`, `resolveSessionMeasurements(input): MeasurementOutcome`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { buildSessionCalendar } from "@/services/market/sessionCalendar";
import { resolveSessionMeasurements } from "@/services/events/reactionMeasurement";

const DAYS = [
  "2025-07-01", "2025-07-02", "2025-07-03",
  "2025-07-07", "2025-07-08", "2025-07-09", "2025-07-10", "2025-07-11",
  "2025-07-14",
];
const calendar = buildSessionCalendar(DAYS);

/** Yahoo stamps daily bars at the session open; close is a separate field. */
const daily = (day: string, close: number) => ({
  sessionDay: day,
  barAt: new Date(`${day}T13:30:00Z`),
  close,
});

const SERIES = DAYS.map((d, i) => daily(d, 100 + i));

const base = {
  symbol: "SPY",
  calendar,
  daily: SERIES,
  priceBasis: "SPLIT_ADJUSTED" as const,
};

describe("resolveSessionMeasurements", () => {
  it("anchors a pre-market release on the prior session close", () => {
    // 2025-07-03 08:30 EDT = 12:30Z.
    const out = resolveSessionMeasurements({
      ...base,
      releaseAt: new Date("2025-07-03T12:30:00Z"),
    });
    expect(out.status).toBe("resolved");
    if (out.status !== "resolved") return;

    const release = out.measurements.find((m) => m.measure === "RELEASE_SESSION");
    expect(release).toMatchObject({
      anchorKind: "PRIOR_SESSION_CLOSE",
      anchorSessionDay: "2025-07-02",
      anchorPrice: 101,
      endpointSessionDay: "2025-07-03",
      endpointPrice: 102,
      releaseSessionDay: "2025-07-03",
    });
  });

  it("offsets SESSION_PLUS_1 and SESSION_PLUS_5 by trading sessions, skipping the holiday", () => {
    const out = resolveSessionMeasurements({
      ...base,
      releaseAt: new Date("2025-07-03T12:30:00Z"),
    });
    if (out.status !== "resolved") throw new Error("expected resolved");

    // Release session index 2; +1 skips Jul 4 to Jul 7; +5 lands on Jul 11.
    expect(
      out.measurements.find((m) => m.measure === "SESSION_PLUS_1"),
    ).toMatchObject({ endpointSessionDay: "2025-07-07", anchorPrice: 101 });
    expect(
      out.measurements.find((m) => m.measure === "SESSION_PLUS_5"),
    ).toMatchObject({ endpointSessionDay: "2025-07-11" });
  });

  it("shares one anchor across all three session measures", () => {
    const out = resolveSessionMeasurements({
      ...base,
      releaseAt: new Date("2025-07-03T12:30:00Z"),
    });
    if (out.status !== "resolved") throw new Error("expected resolved");
    const anchors = new Set(
      out.measurements.map((m) => `${m.anchorSessionDay}:${m.anchorPrice}`),
    );
    expect(anchors.size).toBe(1);
  });

  it("computes pctChange from the stored prices", () => {
    const out = resolveSessionMeasurements({
      ...base,
      releaseAt: new Date("2025-07-03T12:30:00Z"),
    });
    if (out.status !== "resolved") throw new Error("expected resolved");
    const m = out.measurements.find((x) => x.measure === "RELEASE_SESSION")!;
    expect(m.pctChange).toBeCloseTo(((102 - 101) / 101) * 100, 10);
  });

  it("emits NO row for an endpoint session beyond the series", () => {
    const short = { ...base, daily: SERIES.slice(0, 4) };
    const out = resolveSessionMeasurements({
      ...short,
      releaseAt: new Date("2025-07-03T12:30:00Z"),
    });
    if (out.status !== "resolved") throw new Error("expected resolved");
    // Absence is no row — never a placeholder with a null price.
    expect(out.measurements.map((m) => m.measure)).toEqual([
      "RELEASE_SESSION",
      "SESSION_PLUS_1",
    ]);
  });

  it("refuses an undeclared symbol", () => {
    const out = resolveSessionMeasurements({
      ...base,
      symbol: "NVDA",
      releaseAt: new Date("2025-07-03T12:30:00Z"),
    });
    expect(out).toMatchObject({ status: "refused", reason: "undeclared_symbol" });
  });

  it("refuses when the anchor session close is not strictly before the release", () => {
    // 2025-07-07 17:30 EDT = 21:30Z: after the 20:00Z equity close, so the
    // release session is Jul 8 and the anchor session is Jul 7 itself. For a
    // CONTINUOUS_24_7 instrument Jul 7 does not close until ~23:00Z.
    const out = resolveSessionMeasurements({
      ...base,
      symbol: "BTC-USD",
      releaseAt: new Date("2025-07-07T21:30:00Z"),
    });
    expect(out).toMatchObject({
      status: "refused",
      reason: "anchor_not_pre_release",
    });
  });

  it("accepts the same after-hours release for a US_EQUITY_RTH instrument", () => {
    const out = resolveSessionMeasurements({
      ...base,
      symbol: "SPY",
      releaseAt: new Date("2025-07-07T21:30:00Z"),
    });
    expect(out.status).toBe("resolved");
  });

  it("refuses a release timestamped exactly at the close", () => {
    // The anchor session's close equals releaseAt, so it is not strictly before.
    const out = resolveSessionMeasurements({
      ...base,
      releaseAt: new Date("2025-07-07T20:00:00Z"),
    });
    expect(out).toMatchObject({
      status: "refused",
      reason: "anchor_not_pre_release",
    });
  });

  it("emits no rows when the release session is the first in the series", () => {
    const out = resolveSessionMeasurements({
      ...base,
      releaseAt: new Date("2025-07-01T12:30:00Z"),
    });
    expect(out).toMatchObject({ status: "refused", reason: "no_anchor_session" });
  });

  it("rejects a non-positive or non-finite provider price", () => {
    const bad = {
      ...base,
      daily: SERIES.map((b) =>
        b.sessionDay === "2025-07-02" ? { ...b, close: 0 } : b,
      ),
    };
    const out = resolveSessionMeasurements({
      ...bad,
      releaseAt: new Date("2025-07-03T12:30:00Z"),
    });
    expect(out).toMatchObject({ status: "refused", reason: "unusable_anchor_price" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/reactionMeasurement.test.ts`
Expected: FAIL — `Cannot find module '@/services/events/reactionMeasurement'`

- [ ] **Step 3: Write minimal implementation**

```typescript
/**
 * The v3 reaction calculation engine — pure, provider-agnostic, no I/O.
 *
 * Every measure draws its anchor AND its endpoint from a single series, so a
 * measurement can never span two price bases. An unmeasurable window produces
 * no entry: there is no placeholder, no null price and no fabricated zero.
 */
import {
  REACTION_MEASURES,
  sessionOffsetFor,
  type ReactionMeasure,
} from "@/services/events/reactionMeasures";
import {
  nativeCloseMinuteFor,
  sessionBasisFor,
  type SessionBasis,
} from "@/services/market/sessionBasis";
import {
  resolveReleaseSession,
  type SessionCalendar,
} from "@/services/market/sessionCalendar";
import { easternWallClock } from "@/services/macro/time";
import type { PriceBasis } from "@/types/market";

export interface DailyBar {
  /** Canonical session day, YYYY-MM-DD. */
  sessionDay: string;
  /** Provider bar stamp. Yahoo stamps daily bars at the session OPEN. */
  barAt: Date;
  close: number | null;
}

export interface SessionMeasurementInput {
  symbol: string;
  releaseAt: Date;
  calendar: SessionCalendar;
  daily: readonly DailyBar[];
  priceBasis: PriceBasis;
}

export interface ResolvedMeasurement {
  measure: ReactionMeasure;
  anchorKind: "PRIOR_SESSION_CLOSE" | "PRE_RELEASE_INTRADAY_BAR";
  anchorPrice: number;
  anchorBarAt: Date;
  anchorSessionDay: string;
  endpointPrice: number;
  endpointBarAt: Date;
  endpointSessionDay: string;
  releaseSessionDay: string;
  pctChange: number;
  priceBasis: PriceBasis;
  sessionBasis: SessionBasis;
}

export type MeasurementRefusal =
  | "undeclared_symbol"
  | "no_session_after_release"
  | "early_close_unknown"
  | "no_anchor_session"
  | "anchor_not_pre_release"
  | "unusable_anchor_price";

export type MeasurementOutcome =
  | { status: "resolved"; measurements: ResolvedMeasurement[] }
  | { status: "refused"; reason: MeasurementRefusal };

const usable = (v: number | null): v is number =>
  v !== null && Number.isFinite(v) && v > 0;

const pct = (anchor: number, endpoint: number): number =>
  ((endpoint - anchor) / anchor) * 100;

export function resolveSessionMeasurements(
  input: SessionMeasurementInput,
): MeasurementOutcome {
  const sessionBasis = sessionBasisFor(input.symbol);
  if (sessionBasis === null) {
    return { status: "refused", reason: "undeclared_symbol" };
  }

  const release = resolveReleaseSession(input.calendar, input.releaseAt);
  if (release.status === "refused") {
    return { status: "refused", reason: release.reason };
  }

  const anchorDay = input.calendar.dayAt(release.index - 1);
  if (anchorDay === null) {
    return { status: "refused", reason: "no_anchor_session" };
  }

  // The anchor session must close, for THIS instrument, strictly before the
  // release. This is what rejects an after-hours release on a late-closing
  // instrument, and a release timestamped exactly at a close.
  const closeMinute = nativeCloseMinuteFor(
    sessionBasis,
    input.calendar.isEarlyClose(anchorDay),
  );
  const anchorClose = easternWallClock(
    anchorDay,
    Math.floor(closeMinute / 60),
    closeMinute % 60,
  );
  if (anchorClose.getTime() >= input.releaseAt.getTime()) {
    return { status: "refused", reason: "anchor_not_pre_release" };
  }

  const byDay = new Map(input.daily.map((bar) => [bar.sessionDay, bar]));
  const anchorBar = byDay.get(anchorDay);
  if (anchorBar === undefined || !usable(anchorBar.close)) {
    return { status: "refused", reason: "unusable_anchor_price" };
  }

  const measurements: ResolvedMeasurement[] = [];
  for (const measure of REACTION_MEASURES) {
    const offset = sessionOffsetFor(measure);
    if (offset === null) continue;

    const endpointDay = input.calendar.dayAt(release.index + offset);
    if (endpointDay === null) continue;
    const endpointBar = byDay.get(endpointDay);
    if (endpointBar === undefined || !usable(endpointBar.close)) continue;

    measurements.push({
      measure,
      anchorKind: "PRIOR_SESSION_CLOSE",
      anchorPrice: anchorBar.close,
      anchorBarAt: anchorBar.barAt,
      anchorSessionDay: anchorDay,
      endpointPrice: endpointBar.close,
      endpointBarAt: endpointBar.barAt,
      endpointSessionDay: endpointDay,
      releaseSessionDay: release.day,
      pctChange: pct(anchorBar.close, endpointBar.close),
      priceBasis: input.priceBasis,
      sessionBasis,
    });
  }

  return { status: "resolved", measurements };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/reactionMeasurement.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/events/reactionMeasurement.ts tests/reactionMeasurement.test.ts
git commit -m "feat(reactions): session-family measurement engine"
```

---

### Task 8: The calculation engine — intraday family

**Files:**
- Modify: `src/services/events/reactionMeasurement.ts`
- Test: `tests/reactionMeasurement.test.ts`

**Interfaces:**
- Produces: `IntradayBar`, `resolveIntradayMeasurement(input): MeasurementOutcome`
- Constants: `INTRADAY_ANCHOR_MAX_AGE_MS = 2h`, `INTRADAY_ENDPOINT_TARGET_MS = 60min`, `INTRADAY_ENDPOINT_SLIP_MS = 2h`

> **Spec §15.2 — APPROVED.** The invariant is: within one `ReactionMeasurement`
> row, anchor and endpoint share a declared `PriceBasis`; different measures for
> the same instrument may legitimately use different bases. `INTRADAY_60M` uses
> intraday `AS_TRADED` for both sides here — it never touches the daily series —
> so the old cross-series ratio guard is not a precondition for writing this
> measure. That guard is demoted to a reported diagnostic in the provider
> adapter (Task 9), not deleted. This function still enforces the invariant
> itself: it takes exactly one `priceBasis` and applies it to both prices, so a
> caller cannot construct a mixed-basis row through this API.

- [ ] **Step 1: Write the failing test**

```typescript
import { resolveIntradayMeasurement } from "@/services/events/reactionMeasurement";

const hourly = (iso: string, open: number | null) => ({
  barAt: new Date(iso),
  open,
});

const intradayBase = {
  symbol: "SPY",
  priceBasis: "AS_TRADED" as const,
  releaseSessionDay: "2025-07-03",
};

describe("resolveIntradayMeasurement", () => {
  it("anchors on the last bar opening strictly before the release", () => {
    const out = resolveIntradayMeasurement({
      ...intradayBase,
      releaseAt: new Date("2025-07-03T12:30:00Z"),
      intraday: [
        hourly("2025-07-03T12:00:00Z", 100),
        hourly("2025-07-03T13:30:00Z", 102),
      ],
    });
    expect(out.status).toBe("resolved");
    if (out.status !== "resolved") return;
    expect(out.measurements[0]).toMatchObject({
      measure: "INTRADAY_60M",
      anchorKind: "PRE_RELEASE_INTRADAY_BAR",
      anchorPrice: 100,
      anchorBarAt: new Date("2025-07-03T12:00:00Z"),
      endpointPrice: 102,
      endpointBarAt: new Date("2025-07-03T13:30:00Z"),
    });
    expect(out.measurements[0].pctChange).toBeCloseTo(2, 10);
  });

  it("rejects a bar at exactly the release instant as an anchor", () => {
    const out = resolveIntradayMeasurement({
      ...intradayBase,
      releaseAt: new Date("2025-07-03T12:30:00Z"),
      intraday: [
        hourly("2025-07-03T12:30:00Z", 100),
        hourly("2025-07-03T13:30:00Z", 102),
      ],
    });
    expect(out).toMatchObject({ status: "refused", reason: "no_intraday_anchor" });
  });

  it("rejects a stale anchor older than two hours", () => {
    const out = resolveIntradayMeasurement({
      ...intradayBase,
      releaseAt: new Date("2025-07-03T12:30:00Z"),
      intraday: [
        hourly("2025-07-03T10:00:00Z", 100),
        hourly("2025-07-03T13:30:00Z", 102),
      ],
    });
    expect(out).toMatchObject({ status: "refused", reason: "no_intraday_anchor" });
  });

  it("rejects an endpoint beyond the slip window", () => {
    // Target 13:30Z; the next bar is the following morning.
    const out = resolveIntradayMeasurement({
      ...intradayBase,
      releaseAt: new Date("2025-07-03T12:30:00Z"),
      intraday: [
        hourly("2025-07-03T12:00:00Z", 100),
        hourly("2025-07-07T13:30:00Z", 102),
      ],
    });
    expect(out).toMatchObject({ status: "refused", reason: "no_intraday_endpoint" });
  });

  it("tolerates one missing bar inside the slip window", () => {
    const out = resolveIntradayMeasurement({
      ...intradayBase,
      releaseAt: new Date("2025-07-03T12:30:00Z"),
      intraday: [
        hourly("2025-07-03T12:00:00Z", 100),
        hourly("2025-07-03T14:30:00Z", 103),
      ],
    });
    expect(out.status).toBe("resolved");
  });

  it("produces a measurement for a split-adjusted-daily instrument", () => {
    // XLK could not get a 1h reading under v2 because the cross-series basis
    // guard discarded its intraday series. v3 never mixes series, so both bars
    // here are as-traded and internally consistent.
    const out = resolveIntradayMeasurement({
      ...intradayBase,
      symbol: "XLK",
      releaseAt: new Date("2025-07-03T12:30:00Z"),
      intraday: [
        hourly("2025-07-03T12:00:00Z", 232.89),
        hourly("2025-07-03T13:30:00Z", 234.0),
      ],
    });
    expect(out.status).toBe("resolved");
  });

  it("skips unusable opens without borrowing another field", () => {
    const out = resolveIntradayMeasurement({
      ...intradayBase,
      releaseAt: new Date("2025-07-03T12:30:00Z"),
      intraday: [
        hourly("2025-07-03T12:00:00Z", 100),
        hourly("2025-07-03T13:30:00Z", null),
        hourly("2025-07-03T14:00:00Z", 105),
      ],
    });
    if (out.status !== "resolved") throw new Error("expected resolved");
    expect(out.measurements[0].endpointPrice).toBe(105);
  });

  it("refuses an undeclared symbol", () => {
    const out = resolveIntradayMeasurement({
      ...intradayBase,
      symbol: "NVDA",
      releaseAt: new Date("2025-07-03T12:30:00Z"),
      intraday: [
        hourly("2025-07-03T12:00:00Z", 100),
        hourly("2025-07-03T13:30:00Z", 102),
      ],
    });
    expect(out).toMatchObject({ status: "refused", reason: "undeclared_symbol" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/reactionMeasurement.test.ts`
Expected: FAIL — `resolveIntradayMeasurement is not a function`

> **Amendment (§15.2 lock-in):** to make "a measurement must never combine
> prices of different bases" an enforced, testable runtime guarantee rather
> than something merely implied by a scalar parameter, `DailyBar` and
> `IntradayBar` each carry their **own** `priceBasis` per bar. Both engines
> compare `anchorBar.priceBasis === endpointBar.priceBasis` before emitting a
> row and refuse with `mixed_price_basis` on mismatch. Two additional tests are
> required before Step 4:
>
> ```typescript
>   it("is unaffected by the daily series' basis — XLK/XLE are never suppressed", () => {
>     // resolveIntradayMeasurement has no daily-series input at all: XLK's
>     // SPLIT_ADJUSTED daily series cannot reach this function, so it cannot
>     // suppress an otherwise-valid AS_TRADED intraday reading. This is the
>     // exact case the v2 cross-series guard wrongly rejected.
>     const out = resolveIntradayMeasurement({
>       ...intradayBase,
>       symbol: "XLK",
>       releaseAt: new Date("2025-07-03T12:30:00Z"),
>       intraday: [
>         hourly("2025-07-03T12:00:00Z", 232.89, "AS_TRADED"),
>         hourly("2025-07-03T13:30:00Z", 234.0, "AS_TRADED"),
>       ],
>     });
>     expect(out.status).toBe("resolved");
>   });
>
>   it("rejects a single measurement that would combine mismatched bases", () => {
>     const out = resolveIntradayMeasurement({
>       ...intradayBase,
>       releaseAt: new Date("2025-07-03T12:30:00Z"),
>       intraday: [
>         hourly("2025-07-03T12:00:00Z", 100, "AS_TRADED"),
>         hourly("2025-07-03T13:30:00Z", 102, "SPLIT_ADJUSTED"),
>       ],
>     });
>     expect(out).toMatchObject({ status: "refused", reason: "mixed_price_basis" });
>   });
> ```
>
> `hourly()` and `daily()` fixtures gain a third `priceBasis` argument
> defaulting to the family's expected basis, so every pre-existing test in this
> file and in `reactionMeasurement.test.ts` (Task 7) continues to pass
> unmodified.

- [ ] **Step 3: Write minimal implementation**

Append to `src/services/events/reactionMeasurement.ts`:

```typescript
const HOUR_MS = 3_600_000;
export const INTRADAY_ANCHOR_MAX_AGE_MS = 2 * HOUR_MS;
export const INTRADAY_ENDPOINT_TARGET_MS = HOUR_MS;
export const INTRADAY_ENDPOINT_SLIP_MS = 2 * HOUR_MS;

export interface IntradayBar {
  /** Provider bar stamp. Intraday bars are stamped at the bar OPEN. */
  barAt: Date;
  open: number | null;
}

export interface IntradayMeasurementInput {
  symbol: string;
  releaseAt: Date;
  intraday: readonly IntradayBar[];
  priceBasis: PriceBasis;
  /** Resolved by the session pass; recorded for cross-family joins. */
  releaseSessionDay: string;
}

export type IntradayRefusal =
  | "undeclared_symbol"
  | "no_intraday_anchor"
  | "no_intraday_endpoint";

/**
 * `INTRADAY_60M`: both bars come from the intraday series, so this measurement
 * never spans two price bases. The v2 cross-series basis guard is deliberately
 * NOT applied — it existed because v2 mixed an intraday anchor with daily
 * endpoints, and applying it here would suppress valid readings for the very
 * instruments whose mixed anchors motivated this work.
 */
export function resolveIntradayMeasurement(
  input: IntradayMeasurementInput,
): MeasurementOutcome {
  const sessionBasis = sessionBasisFor(input.symbol);
  if (sessionBasis === null) {
    return { status: "refused", reason: "undeclared_symbol" };
  }

  const sorted = [...input.intraday]
    .filter((bar) => Number.isFinite(bar.barAt.getTime()))
    .sort((a, b) => a.barAt.getTime() - b.barAt.getTime());

  const releaseMs = input.releaseAt.getTime();

  let anchor: IntradayBar | null = null;
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const bar = sorted[i];
    const ms = bar.barAt.getTime();
    if (ms >= releaseMs) continue;
    if (releaseMs - ms > INTRADAY_ANCHOR_MAX_AGE_MS) break;
    if (usable(bar.open)) {
      anchor = bar;
      break;
    }
  }
  if (anchor === null || !usable(anchor.open)) {
    return { status: "refused", reason: "no_intraday_anchor" };
  }

  const target = releaseMs + INTRADAY_ENDPOINT_TARGET_MS;
  let endpoint: IntradayBar | null = null;
  for (const bar of sorted) {
    const ms = bar.barAt.getTime();
    if (ms < target) continue;
    if (ms - target > INTRADAY_ENDPOINT_SLIP_MS) break;
    if (usable(bar.open)) {
      endpoint = bar;
      break;
    }
  }
  if (endpoint === null || !usable(endpoint.open)) {
    return { status: "refused", reason: "no_intraday_endpoint" };
  }

  return {
    status: "resolved",
    measurements: [
      {
        measure: "INTRADAY_60M",
        anchorKind: "PRE_RELEASE_INTRADAY_BAR",
        anchorPrice: anchor.open,
        anchorBarAt: anchor.barAt,
        anchorSessionDay: input.releaseSessionDay,
        endpointPrice: endpoint.open,
        endpointBarAt: endpoint.barAt,
        endpointSessionDay: input.releaseSessionDay,
        releaseSessionDay: input.releaseSessionDay,
        pctChange: pct(anchor.open, endpoint.open),
        priceBasis: input.priceBasis,
        sessionBasis,
      },
    ],
  };
}
```

Widen `MeasurementRefusal` to include `IntradayRefusal`'s members.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/reactionMeasurement.test.ts && npm run verify`
Expected: PASS (19 engine tests; full suite green)

- [ ] **Step 5: Commit**

```bash
git add src/services/events/reactionMeasurement.ts tests/reactionMeasurement.test.ts
git commit -m "feat(reactions): intraday-family measurement engine"
```

---

### Task 9: Provider adapter

**Files:**
- Create: `scripts/ingest/measurement-provider.ts`
- Test: `tests/measurementProvider.test.ts`

**Interfaces:**
- Consumes: `yahoo-finance2`, `DailyBar`, `IntradayBar`
- Produces: `MeasurementSeriesProvider`, `createYahooMeasurementProvider()`, `fetchSeries({ symbol, releaseAt }): SeriesFetchOutcome`, `YAHOO_DAILY_BASIS`, `YAHOO_INTRADAY_BASIS`, `toSessionDay(barAt)`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import {
  YAHOO_DAILY_BASIS,
  YAHOO_INTRADAY_BASIS,
  toSessionDay,
} from "../scripts/ingest/measurement-provider";

describe("provider basis declaration", () => {
  it("declares the two Yahoo series bases, which differ", () => {
    // Measured, not assumed: daily OHLC is split-adjusted, intraday is
    // as-traded. Each measure uses exactly one series, so no row mixes them.
    expect(YAHOO_DAILY_BASIS).toBe("SPLIT_ADJUSTED");
    expect(YAHOO_INTRADAY_BASIS).toBe("AS_TRADED");
    expect(YAHOO_DAILY_BASIS).not.toBe(YAHOO_INTRADAY_BASIS);
  });
});

describe("toSessionDay", () => {
  it("maps a daily bar stamp to its US-Eastern session day", () => {
    expect(toSessionDay(new Date("2025-07-03T13:30:00Z"))).toBe("2025-07-03");
  });

  it("does not roll a late-evening UTC stamp into the next Eastern day", () => {
    // 2025-07-03T23:30Z is 19:30 EDT — still July 3 in New York.
    expect(toSessionDay(new Date("2025-07-03T23:30:00Z"))).toBe("2025-07-03");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/measurementProvider.test.ts`
Expected: FAIL — `Cannot find module '../scripts/ingest/measurement-provider'`

- [ ] **Step 3: Write minimal implementation**

```typescript
/**
 * Yahoo adapter for the v3 measurement engine.
 *
 * Returns the two series the engine needs with their bases DECLARED, and maps
 * provider stamps onto US-Eastern session days. It performs no measurement
 * logic: every decision that could misrepresent data lives in
 * `src/services/events/reactionMeasurement.ts`.
 */
import YahooFinance from "yahoo-finance2";

import type {
  DailyBar,
  IntradayBar,
} from "@/services/events/reactionMeasurement";
import type { PriceBasis } from "@/types/market";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey", "ripHistorical"],
});

/** Measured against the provider; see prisma/schema.prisma PriceBasis. */
export const YAHOO_DAILY_BASIS: PriceBasis = "SPLIT_ADJUSTED";
export const YAHOO_INTRADAY_BASIS: PriceBasis = "AS_TRADED";

const DAY_MS = 86_400_000;
const INTRADAY_HORIZON_MS = 720 * DAY_MS;

const sessionDayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** US-Eastern calendar day of a provider bar stamp, YYYY-MM-DD. */
export const toSessionDay = (barAt: Date): string =>
  sessionDayFormat.format(barAt);

export interface SeriesFetchResult {
  daily: DailyBar[];
  dailyBasis: PriceBasis;
  intraday: IntradayBar[];
  intradayBasis: PriceBasis;
  /** Null when the two series do not overlap. Diagnostic only — see §15.2. */
  basisRatio: number | null;
}

export type SeriesFetchOutcome =
  | { status: "ok"; series: SeriesFetchResult }
  | { status: "failed"; reason: string };

export interface MeasurementSeriesProvider {
  readonly id: string;
  fetchSeries(args: {
    symbol: string;
    releaseAt: Date;
  }): Promise<SeriesFetchOutcome>;
}

export function createYahooMeasurementProvider(): MeasurementSeriesProvider {
  return {
    id: "yahoo-finance2@3.14.0",
    async fetchSeries({ symbol, releaseAt }) {
      let daily: DailyBar[] = [];
      try {
        const res = await yahooFinance.chart(symbol, {
          // Wide enough for a prior-session anchor across a long weekend and a
          // +5-session endpoint across holidays.
          period1: new Date(releaseAt.getTime() - 20 * DAY_MS),
          period2: new Date(releaseAt.getTime() + 30 * DAY_MS),
          interval: "1d",
          return: "array",
        });
        daily = res.quotes.map((q) => ({
          sessionDay: toSessionDay(q.date),
          barAt: q.date,
          close: q.close,
        }));
      } catch (error) {
        return {
          status: "failed",
          reason: `daily fetch failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
      }

      const age = Date.now() - releaseAt.getTime();
      let intraday: IntradayBar[] = [];
      if (age >= 0 && age < INTRADAY_HORIZON_MS) {
        try {
          const res = await yahooFinance.chart(symbol, {
            period1: new Date(releaseAt.getTime() - 4 * 3_600_000),
            period2: new Date(releaseAt.getTime() + 12 * 3_600_000),
            interval: "1h",
            return: "array",
          });
          intraday = res.quotes.map((q) => ({ barAt: q.date, open: q.open }));
        } catch {
          // Intraday is optional: its absence removes INTRADAY_60M and leaves
          // every session measure untouched.
          intraday = [];
        }
      }

      return {
        status: "ok",
        series: {
          daily,
          dailyBasis: YAHOO_DAILY_BASIS,
          intraday,
          intradayBasis: YAHOO_INTRADAY_BASIS,
          basisRatio: null,
        },
      };
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/measurementProvider.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest/measurement-provider.ts tests/measurementProvider.test.ts
git commit -m "feat(ingest): Yahoo series adapter with declared price bases"
```

---

### Task 10: Backfill script

**Files:**
- Create: `scripts/backfill/backfill-reaction-measurements.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `createScriptPrismaClient`, `createDryRunPrismaClient`, `reactionTimingEligibility`, `buildSessionCalendar`, `resolveSessionMeasurements`, `resolveIntradayMeasurement`, `createYahooMeasurementProvider`

- [ ] **Step 1: Add the npm scripts**

```json
"backfill:reaction-measurements": "tsx scripts/backfill/backfill-reaction-measurements.ts",
"backfill:reaction-measurements:dry-run": "tsx scripts/backfill/backfill-reaction-measurements.ts --dry-run",
"verify:reaction-measurements": "tsx scripts/maintenance/verify-reaction-measurements.ts",
```

- [ ] **Step 2: Write the script**

Required properties, each load-bearing:

- **Dry-run by default.** `--apply` additionally requires
  `REACTION_MEASUREMENT_BACKFILL_CONFIRM=WRITE_MEASUREMENTS`; otherwise
  `process.exit(2)` with the exact command to retry.
- **Direct endpoint only.** Refuse to run if `DIRECT_URL` is unset, mirroring
  `repair-reaction-timing.ts`.
- **Scope.** Events where `reactionTimingEligibility` returns eligible.
  `--event-id <id>` (repeatable) and `--limit <n>` narrow it.
- **Calendar per event.** Fetch `SPY`'s daily series once per event and build the
  canonical calendar from it. If that fetch fails, skip the **whole event** and
  count `reference_series_unavailable` — never fall back to a per-instrument
  calendar.
- **Per symbol.** Call the provider, then `resolveSessionMeasurements` with the
  daily series and `dailyBasis`, then `resolveIntradayMeasurement` with the
  intraday series, `intradayBasis` and the `releaseSessionDay` the session pass
  resolved. If the session pass refused, skip intraday too — there is no
  `releaseSessionDay` to record.
- **Idempotent.** `createMany({ data, skipDuplicates: true })` against
  `(eventId, symbol, measure, calculationVersion)`.
- **Resumable.** One transaction per event·symbol, oldest event first.
- **Additive.** No `update`, no `delete`, no write to any other table.
- **Rate limiting.** 500 ms between symbols, 1 s between events, mirroring
  `backfill-candles.ts`.
- **Report.** Rows written per measure; refusals grouped by reason; events
  skipped; symbols skipped.

- [ ] **Step 3: Verify the dry-run guard holds**

Run: `npm run smoke:dryrun`
Expected: PASS — writes blocked, reads succeed, row count unchanged

- [ ] **Step 4: Verify apply is gated**

Run: `npm run backfill:reaction-measurements -- --apply`
Expected: exits 2 with the confirmation-variable message. **Nothing written.**

- [ ] **Step 5: Commit**

```bash
git add scripts/backfill/backfill-reaction-measurements.ts package.json
git commit -m "feat(backfill): additive v3 reaction-measurement backfill, dry-run default"
```

---

### Task 11: Verification script

**Files:**
- Create: `scripts/maintenance/verify-reaction-measurements.ts`
- Test: `tests/reactionMeasurementInvariants.test.ts`

**Interfaces:**
- Produces: `checkInvariants(row, context): InvariantViolation[]` (pure, exported for test), plus the CLI

- [ ] **Step 1: Write the failing test for the pure invariant checker**

```typescript
import { describe, expect, it } from "vitest";
import { checkInvariants } from "../scripts/maintenance/verify-reaction-measurements";

const sessionRow = {
  measure: "RELEASE_SESSION" as const,
  anchorKind: "PRIOR_SESSION_CLOSE" as const,
  anchorPrice: 100,
  anchorBarAt: new Date("2025-07-02T13:30:00Z"),
  anchorSessionDay: "2025-07-02",
  endpointPrice: 102,
  // Yahoo stamps the daily bar at the session OPEN, which is BEFORE a 14:00
  // release. A naive `releaseAt < endpointBarAt` check would fail here.
  endpointBarAt: new Date("2025-07-03T13:30:00Z"),
  endpointSessionDay: "2025-07-03",
  releaseSessionDay: "2025-07-03",
  pctChange: 2,
  priceBasis: "SPLIT_ADJUSTED" as const,
  sessionBasis: "US_EQUITY_RTH" as const,
};

const ctx = {
  releaseAt: new Date("2025-07-03T18:00:00Z"), // 14:00 EDT
  sessionDays: ["2025-07-01", "2025-07-02", "2025-07-03", "2025-07-07"],
};

describe("checkInvariants", () => {
  it("accepts a session row whose endpoint bar stamp precedes the release", () => {
    // The session family is verified by SESSION ORDERING, never by naive
    // timestamp ordering against releaseAt.
    expect(checkInvariants(sessionRow, ctx)).toEqual([]);
  });

  it("rejects an anchor session that is not immediately before the release session", () => {
    expect(
      checkInvariants({ ...sessionRow, anchorSessionDay: "2025-07-01" }, ctx),
    ).toContain("anchor_session_not_adjacent");
  });

  it("rejects a session offset that does not match the measure", () => {
    expect(
      checkInvariants(
        { ...sessionRow, measure: "SESSION_PLUS_1", endpointSessionDay: "2025-07-03" },
        ctx,
      ),
    ).toContain("endpoint_session_offset_mismatch");
  });

  it("rejects a pctChange inconsistent with the stored prices", () => {
    expect(checkInvariants({ ...sessionRow, pctChange: 5 }, ctx)).toContain(
      "pct_change_inconsistent",
    );
  });

  it("rejects a non-positive price", () => {
    expect(checkInvariants({ ...sessionRow, anchorPrice: 0 }, ctx)).toContain(
      "non_positive_price",
    );
  });

  it("rejects a session day that is not a canonical session", () => {
    expect(
      checkInvariants({ ...sessionRow, endpointSessionDay: "2025-07-04" }, ctx),
    ).toContain("non_canonical_session_day");
  });

  it("applies instant ordering only to the intraday family", () => {
    const intradayRow = {
      ...sessionRow,
      measure: "INTRADAY_60M" as const,
      anchorKind: "PRE_RELEASE_INTRADAY_BAR" as const,
      anchorBarAt: new Date("2025-07-03T17:30:00Z"),
      anchorSessionDay: "2025-07-03",
      endpointBarAt: new Date("2025-07-03T19:00:00Z"),
      priceBasis: "AS_TRADED" as const,
    };
    expect(checkInvariants(intradayRow, ctx)).toEqual([]);

    expect(
      checkInvariants(
        { ...intradayRow, anchorBarAt: new Date("2025-07-03T18:30:00Z") },
        ctx,
      ),
    ).toContain("intraday_anchor_not_pre_release");
  });

  it("rejects an anchorKind that does not match the measure family", () => {
    expect(
      checkInvariants(
        { ...sessionRow, anchorKind: "PRE_RELEASE_INTRADAY_BAR" },
        ctx,
      ),
    ).toContain("anchor_kind_family_mismatch");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/reactionMeasurementInvariants.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `checkInvariants` plus the CLI**

Universal checks (spec §6.1) and family-branched checks (spec §6.2). The CLI
additionally reports: rows per measure; rows per `sessionBasis`; distinct
`anchorKind` per measure (must be exactly one); distinct `sessionBasis` per
symbol (must be exactly one); the elapsed-minute distribution for
`INTRADAY_60M`; events that hit the early-close ambiguity window; and the
distinct `releaseSessionDay` set per calculation version. Exit non-zero on any
violation. Use `createDryRunPrismaClient` — verification never writes.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/reactionMeasurementInvariants.test.ts && npm run verify`
Expected: PASS (8 tests; full suite green)

- [ ] **Step 5: Commit**

```bash
git add scripts/maintenance/verify-reaction-measurements.ts tests/reactionMeasurementInvariants.test.ts
git commit -m "feat(maintenance): family-branched v3 invariant verification"
```

---

### Task 12: Stage 1 gate

- [ ] **Step 1: Full verification**

Run: `npm run verify`
Expected: PASS

- [ ] **Step 2: Prove no production behaviour changed**

Run: `git diff --stat main -- src/app src/components`
Expected: **empty.** If anything appears, Stage 1 has leaked into the UI.

- [ ] **Step 3: Prove the migration is additive**

Run: `grep -iE "alter table \"asset_reactions\"|^update |^delete |drop table" prisma/migrations/*_add_reaction_measurements/migration.sql`
Expected: no matches

- [ ] **Step 4: Confirm the app still renders v2 reactions**

Run: `npm run dev`, open `/events/42ea8aa8-e35f-4f9b-9f08-5aa2c0b92d6f`
Expected: identical to pre-change — TLT −1.58% headline, 12/12 coverage

---

# STAGE 2 — Dry-run and verification

No writes. Determines whether Stage 3 is safe.

### Task 13: Dry-run the backfill

- [ ] **Step 1: Apply the migration to the database**

Run: `npm run db:deploy`
Expected: `1 migration applied`. Table created; **`asset_reactions` untouched**.

- [ ] **Step 2: Confirm the archive is intact**

Run: `npm run db:verify`
Expected: `asset_reactions: 597` — unchanged from the pre-change baseline.

- [ ] **Step 3: Narrow dry-run on one event**

Run: `npm run backfill:reaction-measurements:dry-run -- --event-id 42ea8aa8-e35f-4f9b-9f08-5aa2c0b92d6f`

Expected report shape:

```
event  June 2025 NFP +147k…   release 2025-07-03T12:30:00Z
  calendar: 41 sessions from SPY, release session 2025-07-03, anchor 2025-07-02
  SPY       RTH   RELEASE_SESSION SESSION_PLUS_1 SESSION_PLUS_5 INTRADAY_60M   (4)
  …
  XLK       RTH   RELEASE_SESSION SESSION_PLUS_1 SESSION_PLUS_5 INTRADAY_60M   (4)
Summary: would insert 48 rows across 12 symbols · refusals: 0
```

The XLK/XLE line is the check that matters: under v2 they had no 1h reading and
a 23h anchor; under v3 they must show `INTRADAY_60M` **and** share the same
anchor session as every other instrument.

- [ ] **Step 4: Full dry-run**

Run: `npm run backfill:reaction-measurements:dry-run 2>&1 | tee /tmp/v3-dryrun.txt`

- [ ] **Step 5: Coverage comparison against v2**

Compare the projected v3 counts against the measured v2 baseline:

| Metric | v2 actual | v3 expected | Gate |
| --- | --- | --- | --- |
| Events with any reaction | 20 | 20 | must not fall |
| `RELEASE_SESSION` rows | n/a | ~240 | ≥ 228 (95 % of 20×12) |
| `SESSION_PLUS_1` rows | 240 (as "1d") | ~240 | ≥ 228 |
| `SESSION_PLUS_5` rows | ~236 (as "1w") | ~240 | ≥ 228 |
| `INTRADAY_60M` rows | 110 | **108 observed 2026-09-12** | semantic gate — see below; the old `≥ 120` threshold is withdrawn |
| Events with mixed anchor sessions | 11 | **0** | must be 0 |
| Distinct `anchorKind` per measure | n/a | 1 | must be 1 |

**Revised intraday gate (spec §14.6).** The original `INTRADAY_60M > 110`
threshold is withdrawn. It assumed v3 would recover XLK/XLE across the same 11
events v2 captured, but intraday history ages out of the provider's ~720-day
rolling retention, so two of those events are no longer obtainable. The gate is
now semantic: v3 must produce every `INTRADAY_60M` measurement currently
obtainable from the provider, and every absence must have an explicit expected
refusal reason. 108 is the observed Stage-2 baseline, not a product invariant.
Never adjust implementation or provider scope to hit a number.

**Mandatory economic-anchor audit.** Before any Stage-3 write, recompute the
economic close instant of every proposed SESSION row and confirm **zero** land
at or after their release. Stage 2 found 57 such rows (all BTC-USD) — see spec
§15.3.

**Failure thresholds — stop and investigate rather than proceeding:**
- any measure below 95 % of the expected row count
- any event with more than one anchor session across its instruments
- any `INTRADAY_60M` absence lacking an explicit expected refusal reason
- any SESSION row whose anchor economic close is at or after its release
- any refusal reason other than `no_intraday_anchor` / `no_intraday_endpoint`
  appearing more than twice

- [ ] **Step 6: Manual inspection of three events**

Hand-check, against the dry-run output:
1. **`June 2025 NFP`** (2025-07-03, pre-market, intraday available) — anchor must be `2025-07-02` for **all twelve** instruments.
2. **`Fed hikes 75bps`** (2022-11-02 14:00 ET, no intraday) — `RELEASE_SESSION` must span 2022-11-01 close → 2022-11-02 close, and `INTRADAY_60M` must be **absent**, not zero.
3. **`June CPI hits 9.1% YoY`** (2022-07-13, oldest) — session measures present; confirms daily coverage reaches back four years.

- [ ] **Step 7: Stage 3 go/no-go**

Proceed only if: every threshold above passes; the three manual checks match;
`npm run verify` is green; and `db:verify` still reports `asset_reactions: 597`.

---

# STAGE 3 — Production backfill

> ## ⛔ REQUIRES EXPLICIT USER APPROVAL
>
> Do not run Task 14 until the user has reviewed the Stage 2 report and approved
> in writing. This is the only production write in the plan.

### Task 14: Apply the backfill

- [ ] **Step 1: Record the pre-state**

```bash
npm run db:verify | tee /tmp/v3-pre.txt
```
Expected: `asset_reactions: 597`, `reaction_measurements: 0`

- [ ] **Step 2: Apply**

```bash
REACTION_MEASUREMENT_BACKFILL_CONFIRM=WRITE_MEASUREMENTS \
  npm run backfill:reaction-measurements -- --apply 2>&1 | tee /tmp/v3-apply.txt
```

Resumable by design: one transaction per event·symbol, oldest first. Ctrl-C
leaves a consistent database; re-running inserts only what is missing, because
`skipDuplicates` matches on the natural key. No batching beyond this is needed
at ~960 rows.

On a provider error the script counts the reason, skips that event·symbol and
continues. On a database error it halts rather than retrying.

- [ ] **Step 3: Verify immediately**

```bash
npm run verify:reaction-measurements
```
Expected: exit 0, zero violations, coverage matching the Stage 2 projection.

- [ ] **Step 4: Confirm the archive is still intact**

```bash
npm run db:verify
```
Expected: `asset_reactions: 597` — **identical to `/tmp/v3-pre.txt`**. Any change
means the backfill wrote outside its table; stop and investigate.

- [ ] **Step 5: Confirm idempotency**

Re-run Step 2. Expected: `0 rows inserted`, all reported as already present.

**Rollback.** No rollback is needed for correctness: `asset_reactions` is
untouched and the read path has not cut over. If v3 rows are wrong, either
`DELETE FROM reaction_measurements WHERE calculation_version = 3` or bump to
version 4 and re-backfill — every read path filters on the current version, so
stale rows are inert either way.

---

# STAGE 4 — Read-path cutover

Merge only after Stage 3 verifies. **No v2 fallback is permitted.**

### Task 15: View types

**Files:** Modify `src/types/events.ts` · Test: `tests/mapEvent.test.ts`

Replace `ReactionWindow` with `ReactionMeasure` (re-exported from
`reactionMeasures.ts`). Replace the flat `price1h/pct1h/…` fields on the
`AssetReaction` view type with:

```typescript
export interface MeasuredMove {
  measure: ReactionMeasure;
  pctChange: number;
  anchorPrice: number;
  anchorBarAt: string;
  anchorSessionDay: string;
  endpointPrice: number;
  endpointBarAt: string;
  endpointSessionDay: string;
  releaseSessionDay: string;
  anchorKind: "PRE_RELEASE_INTRADAY_BAR" | "PRIOR_SESSION_CLOSE";
  priceBasis: PriceBasis;
}

export interface AssetReaction {
  symbol: string;
  name: string;
  assetType: AssetType;
  sessionBasis: SessionBasis;
  /** Only measures that were actually measured. Absence is omission. */
  measures: Partial<Record<ReactionMeasure, MeasuredMove>>;
  headlineMeasure: ReactionMeasure | null;
  percentChange: number | null;
  direction: Direction | null;
}
```

Test: a reaction with only `SESSION_PLUS_5` has `headlineMeasure === null` and
`percentChange === null` — the headline is never back-filled from another
measure. Commit: `refactor(types): v3 measure-keyed reaction view type`.

### Task 16: Mapper

**Files:** Modify `src/services/events/mapEvent.ts` · Test: `tests/mapEvent.test.ts`

`EventRow` gains `reactionMeasurements` and drops `assetReactions`. Group rows by
symbol; filter to `calculationVersion === CURRENT_REACTION_CALCULATION_VERSION`;
keep the timing-eligibility gate unchanged. Headline is `HEADLINE_MEASURE`.
Tests: version filtering; timing suppression; no measure borrowing; `sessionBasis`
propagation. Commit: `refactor(events): map v3 measurements to the view type`.

### Task 17: `MEASURABLE_1D_REACTION` → `MEASURABLE_HEADLINE_MEASUREMENT`

**Files:** Modify `src/services/events/eventQueries.ts:144` · Test: `tests/eventQueries.test.ts`

```sql
rm.calculation_version = ${CURRENT_REACTION_CALCULATION_VERSION}
AND rm.measure = 'RELEASE_SESSION'
AND ABS(rm.pct_change) < 'Infinity'::double precision
AND e.timing_status IN ('VERIFIED', 'SCHEDULED')
AND e.release_at IS NOT NULL
AND NULLIF(BTRIM(e.timing_source), '') IS NOT NULL
```

The fragment stays a single `Prisma.sql` shared by `idsByBiggestMove` and
`countRankable`, so ranking and `rankedCount` cannot disagree. Test: an event
with only `SESSION_PLUS_1` is not rankable. Commit: `refactor(queries): rank on the v3 headline measure`.

### Task 18: Biggest-move ranking and rankable counts

**Files:** Modify `eventQueries.ts` (`idsByBiggestMove`, `countRankable`) · Test: `tests/eventQueries.test.ts`

`MAX(ABS(rm.pct_change))` over `reaction_measurements`. Test: ranking ignores
non-headline measures, and `rankedCount` equals the number of events the ranking
actually orders. Commit: `refactor(queries): biggest-move ranking over v3`.

### Task 19: Featured event

**Files:** Modify `eventQueries.ts:579` (`getFeaturedEvent`) · Test: `tests/eventQueries.test.ts`
Commit: `refactor(queries): featured event from v3 headline measure`.

### Task 20: Library coverage

**Files:** Modify `eventQueries.ts:420` (`getLibraryCoverage`) · Test: `tests/eventQueries.test.ts`

Recount `measuredEvents` from `reaction_measurements`. Commit: `refactor(queries): library coverage from v3`.

### Task 21: Reaction observations

**Files:** Modify `eventQueries.ts:313,326` (`listReactionObservations`) · Test: `tests/eventQueries.test.ts`

`ReactionObservation.values` becomes `Partial<Record<ReactionMeasure, number>>`.
Carry `sessionBasis`. Commit: `refactor(queries): measure-keyed reaction observations`.

### Task 22: Pattern analysis and the pooling guard

**Files:** Modify `src/services/analytics/patternAnalysis.ts` · Test: `tests/patternAnalysis.test.ts`, `tests/patternProfile.test.ts`

`HorizonStats` → `MeasureStats` carrying its `measure`. `statsFor(measure, values)`
**throws** when handed values tagged with more than one measure. Per-measure
buckets are never merged. Tests: pooling two measures throws; a symbol's stats
carry one `sessionBasis`; sub-threshold samples report insufficient rather than a
figure. Commit: `refactor(analytics): per-measure stats with a hard pooling guard`.

### Task 23: Percentiles and distributions

**Files:** Modify `patternAnalysis.ts` (`distributionFor`, `summarizeDistribution`) · Test: `tests/distributionSummary.test.ts`

Key on `ReactionMeasure`. `MIN_DISTRIBUTION_SAMPLE` unchanged. Test: a percentile
is computed only within one measure. Commit: `refactor(analytics): measure-scoped distributions and percentiles`.

### Task 24: Library summary — **spec gap §15.1**

**Files:** Modify `eventQueries.ts:542` (`getLibrarySummary`) · Test: `tests/eventQueries.test.ts`

Missing from the spec's Stage 4 list; found by LSP. Powers the landing page via
`LibraryStats` and `LivePreviewPanel`. Commit: `refactor(queries): library summary from v3`.

### Task 25: Reaction view helpers

**Files:** Modify `src/services/events/reactionView.ts` · Test: `tests/reactionRanking.test.ts`

`pctForWindow`→`pctForMeasure` (map lookup, no switch); `rankByWindow`→
`rankByMeasure`, still separating measured from unmeasured. Add
`assertSingleMeasure`. Commit: `refactor(reactions): measure-keyed view helpers`.

### Task 26: Reaction chart geometry

**Files:** Modify `src/services/events/reactionChart.ts` · Test: `tests/reactionChart.test.ts`

Four ordinal slots. Connectors stay dashed and explicitly unobserved. Commit:
`refactor(reactions): four-measure chart geometry`.

### Task 27: Session-basis badge

**Files:** Create `src/components/reactions/SessionBasisBadge.tsx`

Terse label (`RTH`/`FUT`/`24/7`) from `SESSION_BASIS_BADGE`, `title` from
`SESSION_BASIS_MEANING`, built on the existing `Badge`. Under 40 lines. Commit:
`feat(ui): session-basis badge`.

### Task 28: Event detail, heatmap, ranked bars

**Files:** Modify `src/app/events/[id]/page.tsx`, `EventReactionSummary.tsx`, `EventReactionExplorer.tsx`, `ReactionSummaryTable.tsx`, `CrossAssetReactionBars.tsx`, `HorizonSelector.tsx`, `HorizonMatrix.tsx`, `EventInHistory.tsx`, `MiniReactionBars.tsx`, `EventCard.tsx`

Four-measure selector using the locked labels. Badge on every cross-instrument
surface: the heatmap rows, the ranked-move bars and the "largest measured move"
verdict. Commit: `feat(ui): render v3 measures with session-basis disclosure`.

### Task 29: Patterns page and API

**Files:** Modify `src/app/patterns/page.tsx`, `src/app/api/events/route.ts`, `src/components/patterns/ReactionDistribution.tsx`, `src/components/landing/{LibraryStats,LivePreviewPanel}.tsx`

`h` URL param accepts the four measures; unknown values fall back to
`HEADLINE_MEASURE`. `/api/events` emits `assets[].measures` and
`assets[].sessionBasis`. Commit: `feat(api,ui): v3 measures across patterns and the API`.

### Task 30: Methodology copy

**Files:** Modify `src/app/events/[id]/page.tsx` (`MethodSection`), `src/app/feed/page.tsx` (`CardLegend`)

Must state: the release-session rule; that `RELEASE_SESSION` includes
pre-release trading for an intra-session release; that `INTRADAY_60M` is
temporally tighter where available; the 60-minute slip; the three `sessionBasis`
meanings in full; and that absence means no measurement. **Corrects the existing
false claim** that percentages are measured "from the last bar that *closed*
before the release instant". Commit: `docs(ui): v3 methodology copy`.

### Task 31: Stage 4 gate

- [ ] `npm run verify` — PASS
- [ ] `grep -rn "asset_reactions\|assetReactions" src/` — only the archive note in `timing.ts`; **no read path**
- [ ] Playwright: `/patterns` shows per-measure medians with sample sizes and no pooled figure
- [ ] Playwright: `/events/42ea8aa8…` (good intraday) shows all four measures; **all twelve instruments share one anchor session**
- [ ] Playwright: `/events/<2022 FOMC event>` (fallback) shows the three session measures and `INTRADAY_60M` **absent**, not zero
- [ ] Playwright: zero console errors on all three

---

## Self-review

**Spec coverage.** §3 → Tasks 1, 7, 8. §4 → Tasks 2, 3, 4. §5 → Task 5. §5.1 →
Task 6. §6 → Task 11. §7 → Tasks 22, 23, 25. §8 → stage structure. §9 → Tasks
10, 11, 13, 14. §10 → test matrix distributed across Tasks 1–11. §11 → Tasks
15–30. §12 → Tasks 1, 27. §14 → Global Constraints. §15 → Blocking decisions,
Tasks 8, 24.

**Placeholder scan.** No TBD/TODO. Tasks 10, 11 and 15–30 specify behaviour and
signatures rather than full bodies — deliberate for a script and for 16
mechanical type-migration tasks whose exact edits depend on Task 15's committed
types; each still names its files, its assertions and its commit.

**Type consistency.** `ReactionMeasure`, `SessionBasis`, `MeasuredMove`,
`ResolvedMeasurement`, `MeasurementOutcome`, `SessionCalendar`, `DailyBar`,
`IntradayBar` are spelled identically across every task.
`ARCHIVED_ASSET_REACTION_VERSION` / `CURRENT_REACTION_CALCULATION_VERSION` are
consistently distinguished.

**Known gap.** `maxAbsMove` (`mapEvent.ts:238`) has no production caller — only
tests. Task 16 should port or delete it; flagged rather than silently dropped.
