# Data Sources

An inventory of the data ImpactFeedAI uses and might use. Only the entries
marked **Integrated** exist in the codebase; everything else is a candidate.

**Status values**

| Status | Meaning |
| --- | --- |
| **Integrated** | Code in this repository fetches it today |
| **Researching** | Being evaluated; feasibility or cost unresolved |
| **Planned** | Decided, not built |
| **Rejected** | Evaluated and ruled out, with a reason |

> ⚠️ **Pricing and API terms change.** Anything below marked *(verify)* was not
> confirmed against the provider's current documentation while writing this
> document. Confirm licensing before relying on a source commercially —
> especially for redistribution, which is where most market-data terms bite.

---

## Macroeconomic

### FRED — Federal Reserve Bank of St. Louis · **Integrated**

| | |
| --- | --- |
| Provides | CPI, Core CPI, PPI, Nonfarm payrolls, Unemployment, Fed funds (effective and target upper bound), PCE, Core PCE, GDP, UMich sentiment, JOLTS |
| Endpoint | `api.stlouisfed.org/fred/series/observations` |
| Cost | Free, API key required (`FRED_API_KEY`) |
| History | Deep — decades for most series; `--since 2000-01-01` is the pipeline default |
| Used by | `scripts/ingest/sources-fred.ts` (11 series), `scripts/ingest/fetch-macro.ts` (4 series), `scripts/ingest/sources-fomc.ts` |

**Limitations that matter:**

- **No consensus estimates.** FRED ships actuals only. See
  [the consensus problem](#the-consensus-problem).
- **Observation dates are reference periods, not release dates.** `CPIAUCNS`
  for March is dated 2024-03-01, not the day it was published. The bulk pipeline
  stores that day as `referencePeriodStart` and as the compatibility/display
  `occurredAt`, leaves `releaseAt` and `releaseDate` null, and marks the event
  `REFERENCE_PERIOD_ONLY`. It does not approximate a release timestamp or
  create a price reaction.
- **Bulk values are current-vintage values.** The standard observations endpoint
  returns the latest revised series. The curated monthly path requests an ALFRED
  snapshot as of the seed event date, but falls back to current vintage when
  that snapshot is unavailable. The database records FRED as the actual source,
  but does not yet persist a fetch time or explicit vintage/revision identifier,
  so point-in-time reproducibility is incomplete.
- Raw series are index levels; headline metrics are derived by per-series
  transforms in the pipeline (YoY %, MoM Δ in thousands, level %, QoQ
  annualised).
- Rate limits exist *(verify current threshold)*; the pipeline serialises
  requests.

The 11 bulk series do not all represent the same kind of economic event:

- CPI/Core CPI, PPI, payrolls, unemployment and JOLTS observations identify the
  month measured, not the later BLS publication. JOLTS also has a different
  release schedule from the Employment Situation; no conventional hour is
  inferred for either.
- PCE/Core PCE and GDP are BEA-origin statistics mirrored by FRED. A GDP
  observation identifies a reference quarter; the schema does not yet identify
  advance, second, third or revised estimates.
- `FEDFUNDS` is a monthly average effective rate, not a discrete FOMC decision.
- `UMCSENT` is a monthly FRED observation and does not establish the timestamp
  at which a preliminary or final survey release reached the market.

### BLS — Bureau of Labor Statistics · **Integrated**

| | |
| --- | --- |
| Provides | CPI-U, Core CPI-U, Total Nonfarm Payroll, Unemployment Rate |
| Endpoint | `api.bls.gov/publicAPI/v2/timeseries/data/` (POST) |
| Cost | Free. Key optional (`BLS_API_KEY`) — raises the daily cap from 25 to 500 requests *(verify)* |
| History | Long; capped at 20 years per request, so the pipeline paginates in 10-year chunks |
| Used by | `scripts/ingest/sources-bls.ts` |

The time-series response supplies `year`/`period` and values, not a historical
publication timestamp. Bulk BLS therefore stores the period as
`referencePeriodStart`, leaves exact/date timing null, uses
`REFERENCE_PERIOD_ONLY`, and suppresses reactions just like bulk FRED. Its
canonical keys intentionally match FRED (`macro:<metric>:initial:<period>`), so
when both sources yield the same CPI or labor release the first accepted row is
kept rather than persisting a second cross-check row. BLS is the primary
publisher and also publishes an official release calendar; resolving that
calendar/archive into authoritative historical timing is **Researching**.

### FOMC / Federal Reserve · **Integrated (indirectly)**

Rate decisions are currently derived by walking the FRED `DFEDTARU` daily target
upper-bound series and emitting an event on each step change. The observation
proves the date on which the new target became effective; it does **not** prove
the FOMC statement timestamp. The source subtracts one calendar day and formats
14:00 ET only as an `INFERRED` display value, stores the same inferred day in
`releaseDate`, leaves `releaseAt` null, and suppresses reactions. It also
**omits meetings that held rates steady** — often the most interesting ones.

**Planned** improvements: the official FOMC calendar and statement archive at
`federalreserve.gov` (free, HTML/RSS, no formal API *(verify)*) for meeting
dates including holds, statements, dot plots and minutes.

The repository now has a source-agnostic historical release-calendar contract,
but no adapter is wired to any publisher. It identifies a release by canonical
metric, reference period and normalized stage; accepts exact `VERIFIED` timing
only from an official release record, `SCHEDULED` timing only from an official
schedule, and preserves official date metadata as `DATE_ONLY` with
`releaseAt = null`. Provider identity, credential-free HTTPS citation,
retrieval instant and New York date/instant consistency are validated before a
result could reach ingestion. There is deliberately no fallback clock.

### BEA — Bureau of Economic Analysis · **Researching**

GDP, PCE and personal income at source, with more detail than the FRED mirror
(component breakdowns, vintage tables). Free API with registration *(verify)*.
Low priority while FRED covers the headline numbers.

### Census Bureau · **Researching**

Retail sales, durable goods, trade balance. Free API *(verify)*. Retail sales
is a market-moving release currently missing from the pipeline.

### Treasury · **Planned**

`fiscaldata.treasury.gov` for auction results and the daily yield curve. Free,
official. Relevant to Phase 2 (rate environment) and to auction-day events.

---

## The consensus problem

**This is the single biggest data gap in the project, and it constrains the
whole research thesis.**

`surprise = actual − forecast`. Every free government source publishes the
actual and nothing else. Consensus forecasts are commercial products.
Currently `expectedValue` is hand-typed into `events-seed.ts` for 20 of the 51
events, which does not scale past the seed list. Those legacy values have no
retained citation and are stored as `UNVERIFIED`; every bulk FRED, BLS and FOMC
row stores `MISSING`. The UI may show an unverified value and its arithmetic,
but labels both the estimate and surprise rather than silently promoting them
to consensus.

Candidate paths, none yet chosen:

| Option | Coverage | Cost | Notes | Status |
| --- | --- | --- | --- | --- |
| Commercial calendar APIs (Trading Economics, Econoday, Financial Modeling Prep, and similar) | Broad, includes consensus and release timestamps | Paid, tiers vary widely *(verify)* | Cleanest solution. Check redistribution terms and how much history each tier includes | **Researching** |
| Scraping public calendar sites | Broad | Free | Terms of service almost always prohibit it; fragile; not a foundation to build on | **Rejected** |
| Philadelphia Fed Survey of Professional Forecasters | Narrow, quarterly | Free | Real forecasts, but wrong frequency for monthly releases *(verify coverage)* | **Researching** |
| Cleveland Fed inflation nowcast | CPI/PCE only | Free | A model's expectation, not a market consensus — a proxy, and it must be labelled as one | **Researching** |
| Market-implied expectations (fed funds futures, inflation breakevens/swaps) | Rates and inflation | Free via FRED for some series | Not a "consensus number", but arguably a better measure of what was priced in. Worth having regardless of what else is chosen | **Planned** |
| Derive a naive baseline (e.g. prior value, trailing average) | Complete | Free | Honest fallback, clearly labelled as *not* consensus. Useful for coverage, weak as a surprise measure | **Planned** |

The storage contract is now built. Each release carries `consensusStatus`,
`consensusSource`, `consensusSourceUrl` and `consensusAsOf`. The curated writer
requires all three provenance fields before setting `VERIFIED`; otherwise a
non-null estimate is `UNVERIFIED`. A provider interface and validator are ready
for a future integration and require a finite value, named source, HTTPS URL and
an as-of timestamp no later than a known release instant. No historical
consensus provider is wired in yet, and the schema does not yet distinguish
consensus from nowcast or market-implied methodology beyond the source fields.

---

## Market prices

### Yahoo Finance (`yahoo-finance2`) · **Integrated**

| | |
| --- | --- |
| Provides | OHLCV for the 12-symbol universe: SPY, QQQ, IWM, TLT, GLD, GC=F, CL=F, DX-Y.NYB, BTC-USD, XLE, XLF, XLK |
| Cost | Free, no key |
| History | Daily: decades. **Intraday (1h): roughly 730 days** — older events get daily granularity only |
| Used by | `scripts/ingest/fetch-prices.ts` |

**Limitations:** unofficial API accessed through a community library, so it can
break without notice; throttles under load (the pipeline waits 500 ms per
symbol and backs off 30 s after repeated failures); no guarantee of
adjustment/dividend consistency; **commercial use terms need verification**
before this becomes production infrastructure. The pipeline calls it only for
events with a sourced exact `releaseAt` and eligible timing; reference-only,
inferred and unverified records are intentionally not anchored to market data.

Calculation version 2 requires a strictly pre-release baseline: a recent
intraday open (within two hours) or the preceding session's close (provider bar
within four calendar days). The 1-hour endpoint is release-time-relative;
1-day/1-week use the release session, preserving pre-market and weekend gaps.
For a daily-close fallback Yahoo exposes only the daily bar's timestamp,
normally at session open, so `anchorAt` identifies the bar rather than an exact
closing tick.

Missing from the universe and needed for Phase 2: **VIX and Treasury yields**.

### Yahoo Finance — candle storage · **Integrated (prototype)**

Separate from the reaction path above, `scripts/backfill/backfill-candles.ts`
persists OHLCV bars into the provider-agnostic `candles` table for future
trading charts. Measured limits, not assumed:

| Interval | Lookback | Volume | Basis |
| --- | --- | --- | --- |
| `1m` | 30 days | regular session only | as traded |
| `5m` / `15m` / `30m` | 60 days | regular session only | as traded |
| `1h` | 730 days | regular session only | as traded |
| `1d` | full history | every bar | split-adjusted |

Yahoo exposes **three** price bases and labels none of them: intraday OHLC is
as-traded, daily OHLC is split-adjusted, and daily `adjclose` is split- and
dividend-adjusted. The `Candle.priceBasis` column records which one a row holds;
the backfill verifies intraday against daily before persisting and rejects the
pair outright when they disagree, rather than inferring a split factor.

Extended-hours bars carry real OHLC with `volume: 0`. That zero is the provider
declining to report, not a measurement, so it is stored as `NULL`.

**Prototype only.** No current event can reach 5-minute data, 9 of 20
timing-eligible events are past even the hourly window, and the window rolls —
history is lost permanently as events age. Commercial redistribution terms
remain unverified.

### Polygon.io · **Planned**

Named as the intended price provider in the project instructions; **no code
uses it**. Aggregates, tick data and options across US equities. Paid tiers
with a limited free tier *(verify current limits and history depth)*. The
natural upgrade from Yahoo when reliability and intraday depth start mattering —
particularly for 5-minute and 30-minute reaction windows, which Yahoo cannot
support historically.

### FRED (market series) · **Planned**

Free daily series that cover several Phase 2 needs without a new provider:

- `VIXCLS` — VIX daily close
- `DGS2`, `DGS10`, `DGS30` — constant-maturity Treasury yields
- `T10Y2Y` — 2s10s spread
- `T5YIE`, `T10YIE` — inflation breakevens
- `SP500`, `NASDAQ100` — index levels *(verify licensing on index series)*

Daily granularity only — fine for regime and context features, insufficient for
intraday reaction analysis.

### Futures data (ES, NQ, ZN) · **Researching**

The product's language is futures (ES/NQ) but the pipeline stores ETF proxies
(SPY/QQQ). Proxies are acceptable for daily percentage moves and wrong for
overnight sessions — a CPI print at 08:30 ET moves ES for an hour before the
ETF opens. Continuous-contract history with correct roll handling is the hard
part. Candidate providers: Databento, CME DataMine, Barchart *(all paid,
verify)*.

### Cboe · **Researching**

VIX history and index data direct from the source. Some free daily files; the
intraday and options products are paid *(verify)*.

---

## Options

**Status: Planned / Researching. Nothing built. Phase 5.**

Options data is where "what is the market positioned for" gets answered, and
also where costs jump.

| Source | Provides | Notes | Status |
| --- | --- | --- | --- |
| Cboe DataShop | Historical options quotes, trades, open interest | Paid, per-dataset pricing *(verify)* | **Researching** |
| ORATS | Cleaned historical chains, implied vols, greeks | Paid subscription *(verify)* | **Researching** |
| Polygon.io options | Chains, aggregates | Paid tiers *(verify)* | **Researching** |
| OPRA direct | Full options tape | Prohibitively expensive for this project | **Rejected** |
| Deribit / crypto venues | Crypto options, free APIs | Only relevant if crypto stays in scope | **Researching** |

Dealer gamma exposure is a *derived* metric, not a purchasable one: it needs
open interest by strike plus assumptions about dealer positioning. Any GEX
figure the product shows must state its assumptions.

---

## Order flow

**Status: Researching. Expect this to be difficult and expensive.**

Historical order-flow data — full depth-of-book, message-level tape, footprint
and volume profile reconstruction — is the most expensive category in this
document and the least likely to be free.

- **CME MDP 3.0 historical / CME DataMine** — official futures market data,
  priced per dataset *(verify)*. Storage and processing are non-trivial: raw
  message data for one instrument-year runs to hundreds of gigabytes.
- **Databento** — normalised historical market data with usage-based pricing
  *(verify)*; commonly cited as the most accessible commercial option.
- **Nasdaq TotalView-ITCH** — equity depth, via vendors *(verify)*.
- **Volume profile / footprint** — derivable from tick data rather than bought
  directly. The cost is in the tick data and the processing.

**Realistic assessment:** order flow is a Phase 5+ item, and it may end up
limited to a recent window (last 1–2 years) rather than the deep history the
rest of the platform has. That asymmetry has to be visible in the product —
an analog engine cannot weight a feature that only exists for 5% of the sample.

---

## News and events

Needed for tariff, geopolitical and policy events, which have no equivalent of
a FRED series.

| Source | Provides | Cost | Status |
| --- | --- | --- | --- |
| **Federal Register API** | Executive orders, tariff proclamations, agency rules — official, timestamped, structured | Free | **Planned** — the best structured source for the tariff events already in the seed data |
| **Federal Reserve press releases** | FOMC statements, minutes, speeches | Free (RSS/HTML) | **Planned** |
| **GDELT** | Global event and news database, structured | Free | **Researching** — very broad, needs heavy filtering |
| **NewsAPI / Alpha Vantage news** | Headlines, some sentiment | Freemium *(verify history depth)* | **Researching** — free tiers usually cap historical lookback, which is the part that matters here |
| **RavenPack, Benzinga, Bloomberg** | Curated, timestamped, market-grade news | Enterprise pricing | **Rejected** for now on cost |
| **Hand-curated seed list** | ~51 events in `events-seed.ts` | Free | **Integrated** — does not scale; legacy timestamps and uncited forecasts remain explicitly unverified |

Discretionary events will likely stay partly hand-curated for a while. That is
acceptable if provenance is recorded: a hand-entered event and an
API-sourced one should be distinguishable in the database.

---

## Status summary

| Source | Category | Status |
| --- | --- | --- |
| FRED | Macro | **Integrated** |
| BLS | Macro | **Integrated** |
| FOMC via `DFEDTARU` | Macro | **Integrated** (timing inferred; holds missing) |
| Yahoo Finance | Prices | **Integrated** |
| Hand-curated seed events | News | **Integrated** (legacy timing unverified) |
| FRED ALFRED vintages | Macro | **Integrated** for curated monthly fetches, with current-vintage fallback |
| FRED market series (VIX, yields, breakevens) | Market | **Planned** |
| Federal Register | News | **Planned** |
| Fed press releases | News | **Planned** |
| Treasury fiscal data | Macro | **Planned** |
| Polygon.io | Prices | **Planned** |
| Market-implied expectations | Consensus | **Planned** |
| Commercial calendar APIs | Consensus | **Researching** |
| Philadelphia Fed SPF / Cleveland Fed nowcast | Consensus | **Researching** |
| BEA, Census | Macro | **Researching** |
| Futures history (Databento, CME, Barchart) | Prices | **Researching** |
| Cboe | Volatility/options | **Researching** |
| Cboe DataShop, ORATS, Polygon options | Options | **Researching** |
| CME DataMine, Databento, ITCH | Order flow | **Researching** |
| GDELT, NewsAPI, Alpha Vantage | News | **Researching** |
| Scraping calendar sites | Consensus | **Rejected** — ToS |
| OPRA direct | Options | **Rejected** — cost |
| RavenPack / Bloomberg | News | **Rejected** — cost |

---

## Provenance requirement

The first provenance layer is built. Events distinguish exact release instant,
date-only and reference-period timing and carry a status/source. Data releases
carry stable metric identity, the period measured, actual source/URL, and
consensus status/source/URL/as-of. Existing uncited forecasts were migrated to
`UNVERIFIED`; missing forecasts remain `MISSING`. The migration did not invent
identity, reference-period or actual-source metadata for legacy rows, so those
fields remain null until independently enriched.

The next layer still matters: persist **when a value was fetched, which
vintage/revision and GDP estimate stage it represents, and what kind of
expectation methodology produced it.** There is no normalized `DataSource` or
release-stage model yet. Without those fields, two FRED vintages or a survey
consensus and a model nowcast can still share a shape even though they are not
interchangeable.
