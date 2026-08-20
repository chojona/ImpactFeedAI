# Architecture

This document describes the repository as it actually is, and marks clearly
where something is planned rather than built.

**Status legend**

| Tag | Meaning |
| --- | --- |
| ✅ **Built** | Exists in the repository and runs |
| 🟡 **Partial** | Exists but incomplete or not wired into the product |
| 📋 **Planned** | Agreed direction, no code yet |
| 💭 **Conceptual** | Idea under consideration, may change |

---

## System overview

Today the system is a single Next.js application plus a set of standalone
ingestion scripts that share one Postgres database and one Prisma schema. There
is no separate backend service.

```
┌──────────────────────────────┐        ┌───────────────────────────┐
│  Next.js app (src/)          │        │  Scripts (scripts/)       │
│                              │        │                           │
│  RSC pages ──┐               │        │  ingest.ts (curated)      │
│              ├── Route       │        │  auto-ingest.ts (bulk)    │
│  Client      │   Handlers    │        │  verify-db.ts             │
│  components ─┘   (/api/*)    │        │                           │
└──────┬───────────────────────┘        └────────────┬──────────────┘
       │                                             │
       │ ✅ reads                                    │ ✅ writes
       ▼                                             ▼
                  ┌───────────────────────────────────────────────┐
                  │  PostgreSQL (Prisma)                          │
                  │  events | asset_reactions | data_releases     │
                  └───────────────────────────────────────────────┘
```

The UI and the database are connected. `/feed`, `/events/[id]`, `/patterns` and
`/api/events` all read Postgres; the ingestion scripts write to it. The
placeholder fixtures in `src/lib/mock-data/` have been deleted.

Two Prisma clients, split by consumer rather than by environment:
`src/lib/prisma.ts` on the pooled `DATABASE_URL` for request-path reads, and
`scripts/lib/prisma.ts` on the direct `DIRECT_URL` for the long transactions the
CLIs run.

---

## Frontend

✅ **Built** — Next.js 16.2.6, App Router, React 19.2, TypeScript 5 in `strict`
mode.

### Rendering model

Server Components are the default. Client Components are opt-in islands marked
with `"use client"`, used only where interactivity or a browser API is needed:

| Client component | Why |
| --- | --- |
| `components/events/EventBrowser.tsx` | URL-synced filter/search/sort state, `fetch` to `/api/events` |
| `components/events/CategoryFilterBar.tsx`, `SearchBar.tsx` | input handling |
| `components/reactions/EventReactionExplorer.tsx` | selected-asset and horizon state shared across three panels |
| `components/ui/BackButton.tsx` | `router.back()` |
| `components/ui/RouteError.tsx` | error boundaries must be Client Components |

`EventCard` is no longer a Client Component: its hover lift is a CSS transform
rather than a Framer Motion spring, which keeps per-card JavaScript out of a
list that grows as the reader scrolls.

The reaction visualizations (`ReactionChart`, `ReactionSummaryTable`,
`CrossAssetReactionBars`, `MiniReactionBars`) are presentational and carry no
`"use client"` of their own. They render on the server for the feed and the
landing page, and are pulled into the client bundle only where
`EventReactionExplorer` passes them handlers. They are inline SVG plus absolutely
positioned HTML rather than a charting library: the schema holds three discrete
observations per instrument, and evenly spaced ordinal slots with a dashed
connector is the honest way to draw that. Geometry lives in
`services/events/reactionChart.ts` as pure, tested functions.

Everything else — the landing page, event detail, patterns page — is a Server
Component reading Postgres directly. There are **no Server Actions**; the app
performs no writes at all.

### Routes

| Route | Type | What it does | Data source |
| --- | --- | --- | --- |
| `/` | RSC, ISR (`revalidate = 600`) | Landing: hero panel and figures from Postgres, capability grid, pricing | Postgres ✅, degrades to a no-database state |
| `/feed` | RSC + client island | Event browser with category filter, search, sort, infinite scroll | `/api/events` |
| `/events/[id]` | RSC, dynamic | Event detail, expectation vs. actual, cross-asset reaction | Postgres ✅ |
| `/patterns` | RSC, dynamic | Library coverage plus per-category reaction aggregates; view state in the URL (`cat`, `sym`, `h`) | Postgres + `services/analytics` ✅ |
| `/api/events` | Route Handler (GET) | Filter / search / sort / paginate the event list | Postgres ✅ |

`/events/[id]` and `/patterns` are `force-dynamic`. `generateStaticParams` was
removed from the detail route: the id space is every row in `events` and grows
with each ingestion run, so enumerating it at build time is neither possible nor
useful. ISR is the natural next step once read volume justifies it — the data is
immutable once ingested, so it caches well.

### Styling

Tailwind CSS v4 via `@tailwindcss/postcss`, imported in `src/app/globals.css`.
No component library, no other CSS framework — per the project's coding rules.

Fonts are IBM Plex Sans / Mono, loaded with `next/font/google` in the root
layout and exposed as `--font-ibm-sans` / `--font-ibm-mono`.

The palette (dark `#080C10` background, `#00FF94` green, `#FF6B35` orange) is
applied as hardcoded Tailwind arbitrary values across components. `globals.css`
still carries the create-next-app light/dark `prefers-color-scheme` variables,
which nothing meaningfully uses because every page hardcodes the dark surface.
🟡 Worth consolidating into theme tokens.

### Shared UI types

`src/types/events.ts` holds the presentation-layer domain types (`NewsEvent`,
`AssetReaction`, `DataReleaseView`, `EventTypeName`, `EventCategory`,
`Direction`, `ReactionWindow`, `ReactionSeriesPoint`).
`src/lib/eventCategories.ts` holds `CATEGORY_CONFIG` — per-category colour and
the `higherIsBetter` flag that decides whether a surprise renders green or red —
plus the `EventType`↔`EventCategory` mapping. `src/lib/assets.ts` maps a bare
Yahoo ticker to a display name and asset class, which the schema has nowhere to
store.

Nullability is load-bearing in these types. Every field the database can leave
unset is `| null` all the way to the component, so that "not measured" survives
the trip to the screen instead of being defaulted to `0` or `"FLAT"` somewhere in
the middle.

**Two vocabularies, deliberately.** `EventTypeName` in `types/events.ts` mirrors
the Prisma `EventType` enum one-for-one and is the storage vocabulary.
`EventCategory` is the coarser vocabulary the UI groups by — CPI and PPI both
collapse into `INFLATION`. The mapping is many-to-one and lives in
`src/lib/eventCategories.ts` (`categoryForEventType`, `eventTypesForCategory`),
which is also what turns a UI filter into a Prisma `where` clause. Collapsing to
one vocabulary was considered and rejected: the UI needs fewer, broader buckets
than storage does, and forcing storage to be coarse would lose the distinction
between a CPI print and a PPI print.

`JOBS` was added as a category so `EventType.NFP` stops collapsing into `OTHER`.

The interface `AssetReaction` in `types/events.ts` still shares a name with the
Prisma model while having a different shape (display metadata, a resolved primary
window, nullable moves). They are never imported into the same module.

---

## Backend

✅ **Built** — Next.js Route Handlers only. No tRPC, no GraphQL, no separate API
server, no Server Actions.

`GET /api/events` is the only route handler that remains. The waitlist
endpoint that previously wrote signups to Postgres has been removed along with
the rest of the waitlist feature, so the app performs no database writes and
sends no email.

### `GET /api/events`

✅ Reads Postgres. The query-parameter contract (`type`, `q`, `sort`, `offset`,
`limit`) and the response envelope (`{ events, total, offset, limit, counts }`)
are unchanged from the fixture implementation, which is why swapping the data
source required no change to `EventBrowser`.

The handler is thin — parse, delegate, shape. The work is split so that none of
it needs a request or a database to test:

| Module | Responsibility |
| --- | --- |
| `services/events/queryParams.ts` | validate and clamp the query string. No Prisma import, so checking that `limit=abc` is invalid does not instantiate a connection |
| `services/events/eventQueries.ts` | the Prisma queries |
| `services/events/mapEvent.ts` | row → `NewsEvent`, pure |

Two sorts, implemented differently. `newest` is an indexed
`ORDER BY occurred_at DESC`. `biggest` ranks by the largest absolute move across
an event's `asset_reactions`, which is an aggregate over a child table — one raw
SQL pass returns ordered ids, then a normal `findMany` hydrates them. Filtering
stays in Prisma even for that path so there is one definition of "which events
match"; expressing it a second time in SQL is how two sort modes end up silently
disagreeing. Both sorts tie-break on `id` so pagination is stable.

**Failure modes are distinguished.** A missing `DATABASE_URL` returns
`503 database_not_configured` with a message naming the variable; a query error
returns `502`. Neither renders as "no events match your search", which is what
sends people reading the wrong code.

### Where server logic should live

- **Route Handlers** (`src/app/api/*`) stay thin: parse and validate input, call
  a service, shape the response.
- **`src/services/*`** holds business logic and external-API access:
  `services/analytics/` (aggregate stats), `services/events/` (queries, param
  parsing, row→UI mapping), `services/macro/` (canonical metric registry and
  US-Eastern timestamp resolution, plus release-calendar and consensus provider
  boundaries).
- **`src/lib/*`** holds clients and configuration: `prisma.ts`,
  `eventCategories.ts`, `assets.ts`.
- **`src/server/`** 📋 does not exist yet. Add it when there is server-only
  logic that is neither a client wrapper nor a domain service — query builders,
  caching, auth. Do not create it empty.

---

## Database

✅ **Built** — PostgreSQL, accessed through Prisma 7.8.

### Prisma setup

Prisma 7 requires a driver adapter: `PrismaClient` has **no zero-argument
constructor**. `src/lib/prisma.ts` builds it with `new PrismaPg({ connectionString })`
and caches the instance on `globalThis` outside production to survive dev
hot-reloads.

The client is generated with the `prisma-client` generator into
`src/generated/prisma/`, which is **gitignored** — run `npm run db:generate`
after cloning and after schema changes before typecheck. There is no
`postinstall`; CI generates explicitly, while `npm run build` generates before
invoking Next.js.
`prisma.config.ts` declares the schema and migration paths, and resolves the CLI
connection through `dotenv/config` as `DIRECT_URL ?? DATABASE_URL`. That loader
reads `.env`, not `.env.local`.

### Hosting and endpoints

The database is hosted on **Neon PostgreSQL**. Neon exposes two
endpoints for the same database, and the distinction matters:

| Endpoint | Hostname | Used by |
| --- | --- | --- |
| **Pooled** | contains `-pooler.` | the app on Vercel — serverless opens many short-lived connections |
| **Direct** | without `-pooler.` | Prisma migrations, and everything running locally |

Migrations must never run through the pooled endpoint: Prisma takes advisory
locks, which are unreliable under PgBouncer transaction-mode pooling. That is
why `prisma.config.ts` prefers `DIRECT_URL`.

Routing is by consumer rather than by environment, so both variables are set
the same way locally and in production:

| Consumer | Variable | Endpoint |
| --- | --- | --- |
| `src/lib/prisma.ts` (web app) | `DATABASE_URL` | pooled |
| `prisma.config.ts` (CLI/migrations) | `DIRECT_URL ?? DATABASE_URL` | direct |
| `scripts/lib/prisma.ts` (ingestion + maintenance) | `DIRECT_URL ?? DATABASE_URL` | direct |

`scripts/lib/prisma.ts` is a small shared factory so the endpoint choice lives
in exactly one place — if it drifted per-script, some jobs would silently run
through the pooler.

### Models

| Model | Table | Purpose |
| --- | --- | --- |
| `Event` | `events` | Stable nullable `eventKey`; `headline`, `eventType`; compatibility/display `occurredAt`; exact `releaseAt`, date-only `releaseDate`, `timingStatus` and `timingSource`; source/explanation. `eventKey` is unique; `(headline, occurredAt)` remains a legacy backstop |
| `AssetReaction` | `asset_reactions` | FK → `Event`; symbol, anchor/window prices and changes; `anchorAt` records the provider candle actually used and `calculationVersion` identifies the financial semantics; unique on `(eventId, assetSymbol)` |
| `DataRelease` | `data_releases` | FK → `Event`; stable `metricKey` and `referencePeriodStart`; canonical values; actual source/URL; consensus status/source/URL/as-of; unique on `(eventId, metricName)` |
| `Candle` | `candles` | Provider-agnostic OHLCV bars. No FK to `Event` — candles are reusable instrument time-series many events query over overlapping windows. Unique on `(symbol, interval, openTime, priceBasis)`; `priceBasis` is part of the identity because the same minute quoted as-traded and split-adjusted are two different facts. `volume` is nullable (the provider withholds extended-hours quantities), `session` records REGULAR/EXTENDED, and `ingestionVersion` gates reads exactly as `calculationVersion` does for reactions |

`EventType` enum: `TARIFF`, `FED_DECISION`, `CPI`, `PPI`, `NFP`,
`GEOPOLITICAL`, `EARNINGS_SURPRISE`, `MACRO_DATA`. `EventTimingStatus` is
`VERIFIED`, `SCHEDULED`, `INFERRED`, `DATE_ONLY`, `REFERENCE_PERIOD_ONLY` or
`UNVERIFIED`; `ConsensusStatus` is `VERIFIED`, `UNVERIFIED` or `MISSING`.

Two migrations exist. `20260512194452_init` is the clean three-table baseline.
`20260810231105_add_event_timing_provenance` adds timing, identity, provenance,
consensus and reaction-audit fields; converts the legacy `occurred_at` column
from a timezone-less timestamp to `timestamptz` by explicitly interpreting old
values as UTC; and marks every existing non-null forecast `UNVERIFIED` rather
than inventing provenance. Existing events stay `UNVERIFIED`, with nullable
`eventKey` and `releaseAt`; existing reactions keep nullable legacy audit
fields; and legacy metric/reference/actual-source fields remain null.

The original waitlist-only migration was deleted when the database moved from
Railway to Neon. Because the Neon database was provisioned fresh and no
environment depended on the old journal, rebuilding the baseline was preferable
to shipping a create-then-drop pair for a table the product no longer has.

### Assessment against the product goals

The schema is a sound MVP foundation. The natural keys and unique constraints
are what make the ingestion pipeline safely idempotent, and the
`Event → AssetReaction / DataRelease` split is the right decomposition.

Gaps to address as the product grows — **conceptual, no migration written**:

- **Reaction windows are columns, not rows.** `price1h/1d/1w` cannot express
  5-minute, 30-minute, 4-hour or 3-day windows without a schema change every
  time. A long `EventReaction(eventId, instrumentId, window, …)` table scales;
  the current wide table does not.
- **No instrument table.** `assetSymbol` is a bare string, so there is nowhere
  to record asset class, exchange, contract details, or symbol changes.
- **No market context.** Nothing stores VIX, yields, trend or regime at the
  time of an event — the context that makes an analog meaningful.
- **Provenance is partial, not absent.** Event timing, macro actuals and
  consensus values now carry inline source/status fields. Fetch timestamps,
  explicit vintage/revision identifiers, GDP estimate stage and a normalized
  `DataSource` entity are still missing. Macro data *is* revised, so those gaps
  matter before results can claim point-in-time reproducibility.
- **`Event.explanation` is a free-text column with no writer.** It is where AI
  commentary is meant to land; nothing populates it today.

💭 A plausible future entity set: `Instrument`, `EconomicEvent`,
`EventReaction`, `MarketSnapshot`, `MarketRegime`, `DataSource`,
`HistoricalAnalog`. See [roadmap.md](roadmap.md) for sequencing. Deliberately
**not** implemented yet: designing these before the first end-to-end read path
exists would be guessing.

---

## Data pipeline

✅ **Built** — two independent pipelines under `scripts/ingest/`, run manually
with `tsx`. There is no scheduler, queue, or live feed.

### Conceptual flow

```
External APIs   ✅ FRED, BLS, Yahoo Finance
      ↓
Ingestion       ✅ scripts/ingest/{ingest,auto-ingest}.ts
      ↓
Normalization   ✅ src/services/macro/metrics.ts — per-series transforms
      ↓                (YoY %, MoM Δ, level %, QoQ ann.) + surprise math
Database        ✅ events / asset_reactions / data_releases
      ↓
Analytics       ✅ services/analytics/patternAnalysis.ts (reads the DB)
      ↓
Similarity      📋 not started
      ↓
AI retrieval    📋 not started
      ↓
Frontend        ✅ renders database rows
```

### `ingest.ts` — curated seed

Walks ~51 hand-written events in `events-seed.ts`. Each seed gets a deterministic
curated `eventKey`; the old `(headline, occurredAt)` identity remains a fallback
for rows created before that key existed. It fetches FRED actual/prior data for
CPI / PPI / NFP / FED_DECISION and writes one transaction per event.

Yahoo prices are conditional, not automatic. The legacy seed retained plausible
timestamps but no timing citations, so entries default to `UNVERIFIED` and
produce no reactions. Only an entry with an exact `releaseAt`, status
`VERIFIED` or `SCHEDULED`, and a nonblank `timingSource` can resolve anchor / +1h
/ +1d / +1w prices. New reaction rows persist the provider candle as `anchorAt`
and the current `calculationVersion`.

### `auto-ingest.ts` — bulk backfill

Async generators yield candidate events from three sources — 11 FRED series, 4
BLS series, and target-rate changes derived by walking the `DFEDTARU` daily
series. FRED and BLS time-series dates are stored as
`referencePeriodStart`; they share source-independent keys of the form
`macro:<metric>:initial:<reference-period>`, leave `releaseAt`/`releaseDate`
null and use `REFERENCE_PERIOD_ONLY`. `DFEDTARU` proves the effective date of a
rate change, not the statement time, so its prior-day 14:00 ET display value is
`INFERRED`; `releaseDate` carries that inferred day while `releaseAt` remains
null. All current bulk sources therefore suppress reaction fetching.
`--no-prices` is the appropriate current mode and loads metadata in roughly 15
minutes.

### Failure model

Both pipelines are deliberately best-effort: an eligible symbol fetch may yield
nulls and a warning, a FRED error skips the macro row, and a transaction failure
skips the event. Timing suppression is an intentional integrity result, not a
provider failure. Only unrecoverable conditions (no configured database
connection, unparseable timestamps) halt the run. Re-runs are idempotent.

### Known pipeline limitations

- **No external consensus provider.** FRED and BLS publish actuals only. Bulk
  rows therefore store `MISSING`; hand-entered seed forecasts are `UNVERIFIED`
  unless source, HTTPS URL and as-of metadata validate against a trusted
  `releaseAt`. The storage, validation boundary and UI warning are built, but
  historical forecast coverage is not — see
  [data-sources.md](data-sources.md).
- **Historical release timing is not resolved.** Bulk FRED/BLS reference dates
  are deliberately stored as reference periods, never promoted to conventional
  release times. FOMC announcement timing is explicitly inferred from an
  effective-date change. These records remain searchable, but reactions stay
  absent until an authoritative resolver supplies exact timing. A
  source-agnostic calendar contract now models metric/reference-period/release
  stage and validates `VERIFIED`, `SCHEDULED` or `DATE_ONLY` official evidence,
  including provider identity, credential-free HTTPS citation, retrieval time
  and New York release-day consistency. It has no provider adapter and no
  fallback clock; date-only evidence must keep `releaseAt = null`.
- **Vintage coverage is mixed.** Bulk FRED reads the standard endpoint and gets
  current/revised observations. The curated monthly path asks for an ALFRED
  snapshot as of the seed event date but falls back to current vintage when the
  requested snapshot is unavailable. Neither path persists a vintage identifier
  or fetch timestamp yet.
- **No hold meetings in bulk.** FOMC candidates come from target-rate *changes*,
  so meetings that held rates steady produce no event. Curated seeds can include
  holds, but their timing remains unverified until cited.
- **Yahoo intraday history is ~730 days.** Events older than that get daily
  granularity only; `price1h` is null. It is null, not zero — see below.
- **Only four prices per asset.** `price_at_event / 1h / 1d / 1w` is enough for
  the reaction table and a sparkline, not for an animated replay. Candle-level
  storage now exists in `candles` (see below), but the reaction pipeline does
  not read from it — the two paths are independent today.
- **Candle coverage is bounded by a rolling provider window.** Yahoo serves 1h
  bars for 730 days, 5m/15m/30m for 60 and 1m for 30. No stored event is recent
  enough for 5-minute data, and events leave the hourly window permanently as
  they age. `scripts/backfill/backfill-candles.ts` therefore prioritises the
  oldest reachable events, and `npm run probe:candles` reports what is still
  retrievable.

### Data-integrity invariants the code enforces

These are the ones where a violation produces a plausible-looking wrong number
rather than a visible error, so they are enforced in code and covered by tests
rather than left to review.

**The exact release instant has one meaning and one field.** `occurredAt` is a
required compatibility/display fallback, `releaseDate` is a date without a
time, and `referencePeriodStart` is the period measured by the statistic. None
is a reaction anchor. `releaseAt` is the sole market-facing instant, and it is
eligible only with status `VERIFIED` or `SCHEDULED` plus a nonblank
`timingSource`. `INFERRED`, `DATE_ONLY`, `REFERENCE_PERIOD_ONLY` and
`UNVERIFIED` fail closed. The ingestion writers skip Yahoo; the row mapper hides
any old reactions; and “biggest” ranking applies the same gate in SQL.

**Reaction calculations are versioned and auditable.** Every new reaction
persists the actual provider candle timestamp as `anchorAt` and the current
`calculationVersion`. Read paths discard a row whose version does not match the
current implementation, even if the parent event has trusted timing.

**The denominator is strictly pre-release.** Calculation version 2 uses the
most recent usable intraday open strictly before `releaseAt` when it is at most
two hours old, otherwise the immediately preceding session's close when its
provider bar is at most four calendar days old. A first post-release bar can be
an endpoint, never the baseline. The 1-hour endpoint is release-time-relative;
the 1-day and 1-week endpoints are measured from the release session. This keeps
pre-market and weekend gaps in the reaction and prevents an outside-hours event
from manufacturing a clean 0.00% by reusing one candle.

If no bounded baseline or endpoint exists, the value is null. With the daily
fallback, `anchorAt` is Yahoo's daily-bar timestamp (normally the session open)
even though the baseline value is that bar's close; it is an auditable source
bar identifier, not an exact closing-tick timestamp. Early closes and
extended-hours activity are not modeled.

**A release row is internally single-unit.** `expectedValue`, `actualValue`,
`priorValue` and `surpriseMagnitude` are all in the canonical unit declared for
the metric, and `metricName` is the key that resolves a stored number back to its
unit when the app renders it. An unrecognised `metricName` renders as a bare
number rather than assuming a unit — which is why `events-seed.ts` no longer
overrides `metricName`.

**Consensus provenance controls its label.** A missing estimate is `MISSING`.
A hand-entered estimate without complete provenance is `UNVERIFIED` and any
derived surprise is labelled accordingly. The curated writer requires source,
source URL and as-of metadata before marking a row `VERIFIED`. The unwired
provider boundary goes further: it rejects non-finite values, non-HTTPS URLs and
look-ahead estimates observed after a known release. Actual values separately
carry their source and source URL.

**Absence is not a comparison.** `directionVsPrior` returns null for a missing
prior and the headline omits the clause entirely, instead of rendering "in line
with prior". BLS collected no October 2025 unemployment figure; the November
print must not claim to match a number that does not exist.

**A source window covers its transform's lookback.** `observationStartFor`
fetches further back than `--since` by the number of periods the transform needs.
Without it, `--since 2024-01-01` produced no CPI events until 2025-01 — the first
13 observations had no year-ago comparison, so a full year of the requested range
silently yielded nothing.

**A correct clock conversion is not evidence of a release time.** When a source
really establishes an Eastern wall-clock time, `src/services/macro/time.ts`
converts it to UTC with DST rather than hardcoding `-05:00`. FRED/BLS bulk
sources no longer manufacture 08:30 timestamps from reference periods. FOMC's
14:00 value is explicitly inferred from `DFEDTARU`, stored only as a display
fallback, and remains reaction-ineligible.

### Dry-run semantics

`--dry-run` on every script means "read the database, read the external APIs,
write nothing". It does **not** mean "pretend the database does not exist": the
deduplication check is the most failure-prone step in the pipeline, so a dry-run
that skipped it would not predict the real run.

The guarantee is structural, not conventional. `scripts/lib/readonly-prisma.ts`
wraps the client in an extension that throws `DryRunWriteError` on every write
operation before it reaches the database, including inside `$transaction`. There
is no code path a caller can take to write through a dry-run client.
`npm run smoke:dryrun` asserts both halves — reads succeed, every write is
blocked, row count unchanged.

Dry-runs also track accepted `eventKey` values in memory for the current run, so
two candidates for the same release (FRED and BLS both publish CPI) collide in a
dry-run exactly as they would in a real run where the first had been committed.
The source-independent macro key is
`macro:<metric>:initial:<reference-period>`; same-day/type/metric lookup and the
old `(headline, occurredAt)` constraint remain compatibility backstops.

### Repairing reactions written under legacy assumptions

`scripts/maintenance/repair-reaction-timing.ts` is dry-run by default. It
reports reactions whose event timing is not eligible or whose
`calculationVersion` is not current. The app already hides those rows; the
repair cleans persisted state rather than creating the first safety barrier.
Both report and apply modes require the direct `DIRECT_URL` and refuse the
normal script fallback.

Apply mode additionally requires `--apply`, either `--all` or one or more
`--event-id` values, and the exact
`REACTION_REPAIR_CONFIRM=DELETE_UNTRUSTED_OR_LEGACY_REACTIONS` confirmation. It
deletes only affected `AssetReaction` rows; it never changes `Event` or
`DataRelease`. Trusted legacy events can then be recomputed with
`backfill:prices`. Untrusted events remain reaction-free until their release
timing is authoritatively sourced.

### Where ingestion code should eventually live

🟡 Partially done. `src/services/macro/` now holds the canonical metric registry
and the timestamp helper, because the web app genuinely needs them: rendering a
stored `DataRelease` number requires knowing the unit it was stored in, and that
knowledge cannot be duplicated without the two copies drifting.

The HTTP *clients* (FRED, BLS, Yahoo) are still in `scripts/ingest/`. Nothing in
the request path fetches from an external provider, so moving them would be churn
with no consumer. `src/services/market-data/` is where they go when that changes.

### Script organisation

```
scripts/
├── lib/           ✅ prisma.ts (DIRECT_URL factory), readonly-prisma.ts (dry-run guard)
├── ingest/        ✅ pipelines + sources + shared fetch/compute helpers
├── backfill/      ✅ backfill-prices.ts — idempotent, resumable, additive
└── maintenance/   ✅ verify-db.ts, smoke-macro.ts, smoke-dryrun-guard.ts,
                      repair-data-releases.ts, repair-reaction-timing.ts
```

📋 `scripts/analysis/` when there is something to put in it.

---

## AI layer

📋 **Not built.** `@anthropic-ai/sdk` is installed but imported nowhere; there
are no API calls to any model, and `ANTHROPIC_API_KEY` is not read anywhere in
the codebase.

The design constraint is settled even though the code is not:

> **The LLM is never the source of truth for historical market data.** The
> structured database is. The AI layer retrieves rows, summarises them,
> compares them, and explains them.

Concretely, that means:

1. A natural-language question is translated into a **structured query** over
   `events` / `data_releases` / `asset_reactions` (and later the analog engine).
2. The query runs against Postgres. Rows come back.
3. The model receives **only those rows** as context and writes prose over them.
4. The response cites the records it used, and the UI can display them.

A model must never supply a number, a date, or an event from its own memory.
Any number in the product must be traceable to a row a user can inspect.
Practically this favours tool-use with a constrained query surface over
free-form SQL generation, and requires that "no matching data" be a first-class
answer rather than something the model papers over.

Planned home: `src/services/ai/`, with the model client in `src/lib/`
alongside the other clients. Not before Phase 4.

---

## Future Python analytics layer

💭 **Conceptual — no Python exists in this repository.** No `.py` files, no
`requirements.txt`, no virtualenv, no runtime dependency.

The TypeScript stack is fine for ingestion, storage and serving. It is a poor
fit for the numerical work Phases 3 and 6 imply. If and when that work starts,
the likely shape is a separate batch service that reads and writes the same
Postgres database rather than a rewrite:

- **pandas / numpy** for time-series alignment and vectorised window math
- **scipy / statsmodels** for distributions, hypothesis tests, correlations
- **scikit-learn** for normalisation, clustering, regime classification
- Batch jobs computing features and similarity scores into materialised tables,
  which Next.js reads through Prisma like any other row

The boundary that keeps this clean: **Python writes derived tables, TypeScript
serves them.** No synchronous request path from the web app into Python.
`.gitignore` already covers `__pycache__/` and virtualenvs so this can be added
without touching git hygiene.

---

## Testing

✅ **Vitest**, unit tests only, in `tests/`. `npm test` runs them; `npm run verify`
runs typecheck + lint + test. No database, network or browser required.

Config is `vitest.config.mts` — `.mts` so Vite loads it as ESM natively, and
`resolve.tsconfigPaths` so tests import through the same `@/` specifiers as the
app rather than a parallel set of relative paths.

| Suite | Covers |
| --- | --- |
| `tests/metrics.test.ts` | YoY / QoQ-annualised / MoM transforms, surprise arithmetic, unit and percentage-point formatting, registry integrity (every metric round-trips through its canonical name; FRED and BLS bindings agree) |
| `tests/fetch-prices.test.ts` | window resolution against synthetic candle series, including named regressions for the fabricated-0.00% bug |
| `tests/time.test.ts` | 08:30 / 14:00 ET across both DST transitions, plus a round-trip assertion |
| `tests/timing.test.ts` | the reaction-eligibility matrix, missing provenance, and status labels |
| `tests/source-timing.test.ts` | FRED/BLS reference-period-only candidates and inferred FOMC timing |
| `tests/release-calendar.test.ts` | official-record/schedule/date-only provenance, normalized release identity, DST/day boundaries and no implicit fallback instant |
| `tests/consensus.test.ts` | the provider boundary's source, HTTPS URL, finite-value and no-look-ahead checks |
| `tests/mapEvent.test.ts` | row → `NewsEvent`, null propagation, primary-window selection, category mapping is a partition |
| `tests/patternAnalysis.test.ts` | aggregation over measured moves only, sample-size reporting |
| `tests/queryParams.test.ts` | `/api/events` parameter validation and clamping |

The bias is deliberate: coverage concentrates where a bug becomes *wrong data*
rather than a wrong pixel. A mis-signed surprise or a null coerced to zero is
invisible in the UI and permanent in the database.

📋 Still outstanding:

1. **`@testing-library/react`** for the interactive components — `EventBrowser`
   URL syncing is the one with real branching. Needs `jsdom`.
2. **Integration tests against a real Postgres** for `eventQueries.ts`. The raw
   SQL in the `biggest` sort is the part unit tests cannot reach; it was verified
   manually against a local Postgres instance.
3. **Playwright** for end-to-end.

### Continuous integration

✅ `.github/workflows/ci.yml` runs on every push and pull request with read-only
repository permissions and no database/provider secrets. It installs with
`npm ci`, explicitly generates the gitignored Prisma client, then runs
typecheck, lint, unit tests, `prisma validate` and a production build. Node comes
from `.nvmrc`; npm caching uses the lockfile.

---

## Deployment

🟡 **Vercel is the deployment target.** The repository does not contain local
`.vercel/project.json` link metadata, so a project must be linked or configured
in Vercel before deployment.

Notes for a deploy that touches the database:

- Environment variables must be set in the Vercel project — `.env.local` is
  local-only.
- `npm run build` explicitly runs `prisma generate` before `next build`. The
  generated client is gitignored and this repository intentionally has no
  `postinstall`; do not rely on platform detection to generate it.
- Migrations should be applied with `npm run db:deploy`
  (`prisma migrate deploy`), never `migrate dev`.
- ✅ `@prisma/client` is in `dependencies`. It used to be a devDependency, which
  worked on Vercel only because build-time installs include dev dependencies; any
  deploy path using `npm install --omit=dev` would have broken at runtime.
- ✅ `dotenv` is declared as a direct `devDependency`. It is imported by
  `prisma.config.ts` and every script, and previously resolved only as a
  transitive dependency of Prisma.
- ✅ `engines.node` is `^22.12.0 || >=24.0.0`; `.nvmrc` selects Node 22 and Node
  23 is outside the declared range.
- ⚠️ `DATABASE_URL` is now required for the app to show any data. `/feed`,
  `/events/[id]` and `/patterns` return empty states or 503 without it, rather
  than falling back to fixtures — the fallback was removed deliberately, since
  serving hand-written numbers under the same styling as measured data is the
  failure mode this product can least afford.

---

## Conventions

From `CLAUDE.md`, and observed in the code:

- TypeScript `strict`, no `any`
- Functional components only; named exports for components
- `async`/`await`, never raw `.then()` chains
- Tailwind for all styling; inline styles only for dynamic values
- Mobile-first responsive
- Components under 150 lines — extract when longer. ⚠️ `src/app/page.tsx` is
  ~800 lines with fourteen section components inline; it should be split into
  `components/landing/`. Still outstanding.
- Surprise direction always derives from `CATEGORY_CONFIG[category].higherIsBetter`,
  never from a raw `actual > expected` comparison.

### Where does new code go?

| Kind of code | Location |
| --- | --- |
| Route, page, layout | `src/app/` |
| Reusable UI | `src/components/<domain>/` |
| Third-party client, app config | `src/lib/` |
| Business logic, external-API service | `src/services/<domain>/` |
| Shared type used in more than one module | `src/types/` |
| Unit test | `tests/<module>.test.ts` |
| One-off or scheduled job | `scripts/<category>/` |
| Small pure helper | inline near its use until a second caller appears, then `src/utils/` |
