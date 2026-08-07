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
      `scripts/{ingest,maintenance}`, placeholder data isolated in
      `src/lib/mock-data/`
- [x] Documentation — README plus `docs/{vision,architecture,data-sources,research-methodology,roadmap}.md`
- [x] Environment variables — every variable the code reads documented in
      `.env.example` and the README
- [x] Database foundation — Prisma 7 + Postgres, schema and migrations for
      events, asset reactions, data releases
- [x] Development workflow — `dev`, `build`, `lint`, `typecheck`,
      `db:generate`, `db:migrate`, `db:deploy`, `db:verify`, `ingest`,
      `auto-ingest`
- [ ] Fix the two pre-existing lint errors (`AssetChart.tsx` refs-during-render,
      `EventBrowser.tsx` setState-in-effect)
- [ ] Declare `dotenv` as a devDependency; move `@prisma/client` to
      `dependencies`
- [ ] Split the 840-line `src/app/page.tsx` into `components/landing/`
- [ ] Commit the working tree — the entire ingestion pipeline is currently
      untracked
- [ ] Test framework (Vitest) covering the reaction and surprise math
- [ ] CI running typecheck + lint + test

---

## Phase 1 — Historical macro event database 🎯

**Goal: the UI reads real ingested events instead of fixtures.** This is the
narrowest useful product and the only thing that matters right now.

Deliberately narrow scope: **CPI, PPI, NFP, FOMC, PCE, GDP.** Tariff,
geopolitical and earnings events already in the seed data stay, but no effort
goes into expanding them yet.

- [ ] **Mapping layer** between Prisma rows and UI types — reconcile
      `EventType` (`FED_DECISION`, `CPI`, …) with `EventCategory` (`FED`,
      `INFLATION`, …), or converge on one vocabulary and delete the other
- [ ] **`/api/events` reads Postgres** — same query contract (`type`, `q`,
      `sort`, `offset`, `limit`), same response envelope, Prisma underneath
- [ ] **`/events/[id]` reads Postgres** — replace `generateStaticParams` over
      fixtures with dynamic or ISR rendering
- [ ] **Charts render stored reaction data** rather than synthetic series
- [ ] **Delete `src/lib/mock-data/`** once nothing imports it
- [ ] **Consensus/forecast source** — decide how `expectedValue` gets populated
      at scale. Without it there is no surprise, and without surprise most of
      the research thesis collapses. See
      [data-sources.md](data-sources.md#the-consensus-problem)
- [ ] **Price backfill script** — `scripts/backfill/` for events that were
      ingested with `--no-prices`
- [ ] **Release-date accuracy** — FRED observation dates are reference periods,
      not release timestamps; reaction windows need the moment the number hit
      the tape

Target record per event:

| Field | Status |
| --- | --- |
| timestamp | ✅ `Event.occurredAt` |
| event type | ✅ `Event.eventType` |
| actual | ✅ `DataRelease.actualValue` |
| forecast | 🟡 hand-entered only |
| previous | ✅ `DataRelease.priorValue` |
| surprise | 🟡 only where a forecast exists |
| asset | ✅ `AssetReaction.assetSymbol` |
| price before event | ✅ `priceAtEvent` |
| price after event | ✅ `price1h`, `price1d`, `price1w` |
| short-term reaction | 🟡 1h is the shortest window; 5m/30m need intraday data |
| longer-term reaction | 🟡 1w is the longest window |

**Done when:** a user can browse, filter and open a database-backed event and
see its real cross-asset reaction, with no fixture code left in the app.

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
