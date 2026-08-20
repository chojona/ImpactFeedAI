# Roadmap

Phases are ordered by dependency, not by date. Each one should produce
something usable on its own; nothing here is worth building if the phase before
it does not work reliably.

**Horizon labels**

- 🎯 **MVP** — required for the first genuinely useful version
- 🔜 **Near-term** — the next expansion once the MVP holds up
- 🔭 **Long-term** — directionally agreed, deliberately unspecified

---

## Phase 0 — Foundation 🎯

*Mostly complete.*

- [x] Repository organisation — `src/{app,components,lib,services,types}`,
      `scripts/{lib,ingest,backfill,maintenance}`, `tests/`
- [x] Documentation — README plus `docs/{vision,architecture,data-sources,research-methodology,roadmap}.md`
- [x] Environment variables — every variable the code reads documented in
      `.env.example` and the README
- [x] Database foundation — Prisma 7 + Postgres, schema and migrations for
      events, fail-closed timing, versioned asset reactions, release provenance
      and consensus status
- [x] Development workflow — `dev`, `build`, `lint`, `typecheck`,
      `db:generate`, `db:validate`, `db:migrate`, `db:deploy`, `db:verify`,
      `ingest`, `auto-ingest`
- [x] Fix the two pre-existing lint errors (refs-during-render in the chart
      component, setState-in-effect in `EventBrowser.tsx`)
- [x] Declare `dotenv` as a devDependency; move `@prisma/client` to
      `dependencies`. Dropped `axios` and `recharts`, which nothing imported
- [x] Test framework — Vitest, `npm test`. Covers the macro transforms, the
      price window resolution, the DB→UI mapper, query parsing and the pattern
      aggregation
- [x] CI — secret-free GitHub Actions runs explicit Prisma generation,
      typecheck, lint, unit tests, schema validation and production build on
      pushes and pull requests
- [x] Split the ~800-line `src/app/page.tsx` into `components/landing/`. The
      hardcoded statistics strip and preview card were replaced with database
      reads that degrade to a no-database state

---

## Phase 1 — Historical macro event database 🎯

**Goal: the UI reads real ingested events instead of fixtures.** This is the
narrowest useful product and the only thing that matters right now.

Deliberately narrow scope: **CPI, PPI, NFP, FOMC, PCE, GDP.** Tariff,
geopolitical and earnings events already in the seed data stay, but no effort
goes into expanding them yet.

- [x] **Mapping layer** between Prisma rows and UI types —
      `src/services/events/mapEvent.ts`. Both vocabularies were kept: `EventTypeName`
      mirrors the Prisma enum and is what filters translate into, `EventCategory`
      is the coarser grouping the UI shows, and the many-to-one mapping lives in
      `src/lib/eventCategories.ts`. `JOBS` was added so NFP stops collapsing into
      `OTHER`
- [x] **`/api/events` reads Postgres** — same query contract (`type`, `q`,
      `sort`, `offset`, `limit`), same response envelope, Prisma underneath.
      `sort=biggest` aggregates over `asset_reactions` in SQL
- [x] **`/events/[id]` reads Postgres** — `generateStaticParams` removed; the id
      space is now every row in `events`, so the route renders on demand
- [x] **`/patterns` reads Postgres** — aggregates computed from stored reactions
- [x] **Charts render stored reaction data** rather than synthetic series
- [x] **Delete `src/lib/mock-data/`** — nothing imports it
- [x] **Price backfill script** — `scripts/backfill/backfill-prices.ts`,
      idempotent and resumable; it only considers events whose exact timing is
      trusted
- [x] **Timing/reference integrity plumbing** — separate `releaseAt`,
      `releaseDate` and `referencePeriodStart`; require `VERIFIED`/`SCHEDULED`
      exact timing plus a source before reactions; persist `anchorAt` and
      `calculationVersion`; hide legacy/ineligible rows in every read path; and
      validate official record/schedule/date-only results behind a
      source-agnostic release-calendar contract
- [x] **Legacy reaction repair** — dry-run-first report, explicit confirmed
      deletion, then recompute only trusted events with `backfill:prices`
- [ ] **Authoritative historical release timing** — resolve official dates and
      exact market-facing instants. FRED/BLS bulk rows currently remain
      `REFERENCE_PERIOD_ONLY`; `DFEDTARU` FOMC timing is `INFERRED`; legacy
      curated timestamps are `UNVERIFIED`. The wall-clock helper can convert a
      sourced Eastern time with DST, but it does not prove when a release
      happened
- [x] **Consensus safety plumbing** — persist `VERIFIED` / `UNVERIFIED` /
      `MISSING`, source/URL/as-of metadata, actual provenance, and a provider
      validation boundary; label unverified surprises in the UI
- [ ] **Consensus/forecast provider** — populate verified historical estimates
      at scale. FRED/BLS/FOMC bulk rows have `MISSING` consensus and uncited seed
      values remain `UNVERIFIED`. Without a real forecast source, most events
      have no defensible surprise. See
      [data-sources.md](data-sources.md#the-consensus-problem)
- [ ] **Intraday candle storage** — the schema holds four prices per asset
      (anchor, +1h, +1d, +1w), which is enough for the reaction table and a
      sparkline but not for a true replay. A candle table (or the Polygon.io
      integration named in the README) is what the animated replay needs

Target record per event:

| Field | Status |
| --- | --- |
| compatibility/display timestamp | ✅ `Event.occurredAt` (never a reaction anchor by itself) |
| exact release timestamp | 🟡 `Event.releaseAt` + eligibility guard built; authoritative coverage missing |
| release date without time | 🟡 `Event.releaseDate` built; coverage missing |
| timing status/source | 🟡 storage and UI built; current sources are mostly untrusted |
| reference period | ✅ `DataRelease.referencePeriodStart`, separate from release timing |
| event type | ✅ `Event.eventType` |
| metric identity + actual provenance | 🟡 fields populated by new ingestion; migrated legacy rows remain null |
| actual | ✅ `DataRelease.actualValue` when a source supplies one |
| forecast | 🟡 hand-entered only; bulk is `MISSING` |
| forecast provenance | ✅ status/source/URL/as-of shape; verified provider missing |
| previous | ✅ `DataRelease.priorValue` |
| surprise | 🟡 only where a forecast exists; unverified arithmetic is labelled |
| asset | ✅ `AssetReaction.assetSymbol` on timing-eligible events |
| reaction anchor audit | ✅ `anchorAt` + `calculationVersion` |
| price before event | 🟡 `priceAtEvent`, conditional on trusted timing |
| price after event | 🟡 `price1h`, `price1d`, `price1w`, conditional on trusted timing |
| short-term reaction | 🟡 1h is the shortest window; 5m/30m need intraday data |
| longer-term reaction | 🟡 1w is the longest window |

**Done when:** a user can browse, filter and open a database-backed event and,
where authoritative release timing exists, see a current-version cross-asset
reaction with its anchor provenance. No fixture code remains in the app.

---

## Phase 2 — Market context 🔜

**Goal: know what the market looked like when each event landed.** Without
this, every analog is a single-variable match, which is exactly the naive
approach the product exists to improve on.

- [ ] Ingest context series: SPX/ES/NQ, 2y and 10y Treasury yields, VIX, DXY
      (note: the current 12-symbol universe has no VIX and no yield series)
- [ ] `MarketSnapshot`-style storage of conditions at event time
- [ ] Derived features: trend (distance from N-day high, moving-average
      relationships), realised volatility, VIX percentile, yield direction,
      curve shape
- [ ] Regime tagging: inflation direction, Fed policy stance, volatility
      regime, equity trend — see
      [research-methodology.md](research-methodology.md#market-regimes)
- [ ] Surface context on the event detail page — "this print landed with VIX at
      21 and the 10y up 18bp in a month"
- [ ] Filter the event browser by context, not just category

**Done when:** an event page shows the environment it happened in, and the
browser can answer "show me CPI prints where VIX was above its median".

---

## Phase 3 — Historical analog engine 🔭

**Not to be started before Phases 1 and 2 are solid.** Similarity scoring over
incomplete or unvalidated data produces confident nonsense.

Likely components:

- Normalised macro features (surprise in standard deviations, not raw units)
- Rate-environment features (level, direction, curve)
- Volatility features (level, percentile, term structure)
- Trend and price-structure features
- Positioning features (Phase 5)
- A weighted composite score across feature families

Open design questions that need answering with data, not intuition: how to
weight the families, which distance metric to use, how to handle missing
features, and how to prevent the scoring from collapsing into "same event type,
similar date". Weights should be validated empirically — if a weighting scheme
does not produce more homogeneous outcome distributions than a naive
same-event-type baseline, it is not adding anything.

**Done when:** given a current or hypothetical setup, the system returns ranked
historical analogs with an explanation of which features matched.

---

## Phase 4 — AI research interface 🔭

Natural-language querying over the structured data.

- Question → structured query over events, releases, reactions, analogs
- Retrieval-grounded answers only; every number traceable to a row
- Show the underlying records alongside the prose
- "No matching data" is a valid and expected answer
- Optional: generated per-event explanations written into `Event.explanation`,
  clearly labelled as generated

Hard constraint: the model never supplies a historical fact from memory. See
[architecture.md](architecture.md#ai-layer).

---

## Phase 5 — Advanced market data 🔭

Each item here is a research project on its own, mostly gated on data
availability and cost rather than engineering:

- Options flow and volume
- Dealer positioning / gamma exposure
- Order flow and tape data
- Volume profile
- Open interest
- CFTC COT positioning

Historical intraday order-flow data in particular is expensive and hard to
obtain — see [data-sources.md](data-sources.md#order-flow).

---

## Phase 6 — Advanced research 🔭

Speculative. Only worth attempting with a large, clean, validated dataset:

- Embeddings over market states
- Clustering and unsupervised regime discovery
- Statistical pattern analysis with proper significance testing
- Cross-asset correlation and lead–lag structure
- Outcome probability distributions with confidence intervals

---

## Explicitly out of scope

Not "later" — never, per [vision.md](vision.md#out-of-scope):

- Trade signals, entries, targets
- Order execution or broker integration
- Point price predictions
- Financial advice

Deferred by the current project rules: authentication, payments, and any
external CSS library.
