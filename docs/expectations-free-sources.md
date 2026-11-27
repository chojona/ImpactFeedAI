# Free expectations sources — research & foundation

**Budget:** $0. Hindsight and other paid consensus calendars are out of scope.

**Coordination:** Agent 03 (`feat/phase-1.1-alfred-point-in-time`) owns ALFRED
actuals / `ContextObservation` / point-in-time selection. This foundation owns
**expectations only**. Do not merge expectation rows into context observations.
Surprise joins require (1) a first-print actual from Agent 03 and (2) a
`SURVEY_CONSENSUS` expectation with `asOfQuality=VERIFIED` when Street-style
surprise is claimed.

Code: `src/types/expectations.ts`, `src/services/expectations/`.

---

## Kind separation (non-negotiable)

| Kind | Sources in this foundation | May feed Street surprise? |
| --- | --- | --- |
| `SURVEY_CONSENSUS` | Curated public-news citations; prospective free captures | Only with verified pre-release `asOf` |
| `MODEL_NOWCAST` | Atlanta GDPNow; Cleveland inflation nowcasts | **Never** |
| `PROFESSIONAL_SURVEY` | Philadelphia Fed SPF | **Never** (wrong frequency/horizon for monthly prints) |
| `MARKET_IMPLIED` | FRED breakevens (e.g. T5YIE) | **Never** |

Missing consensus stays **missing** (`null` / no row). Never coerce to `0`.

Never invent `asOf`. Prefer `DATE_ONLY` or `MISSING` over fabricated clocks.

Point-in-time selection (`selectFixtureExpectation`) filters by timing
eligibility **before** picking the latest row: a later post-release record
cannot displace an earlier eligible one. Street surprise and the legacy
`ConsensusEstimate` bridge require strict `asOf < releaseAt` (equality is not
pre-release). `DATE_ONLY` rows are eligible only when `asOfDate` is strictly
before the release calendar day — same-day dates stay out without inventing a
clock.

---

## Source verification summary

### Atlanta Fed GDPNow — `MODEL_NOWCAST`

| | |
| --- | --- |
| History | Tracking deep archives ~2011:Q3; live model from 2014:Q2; FRED `GDPNOW` stores final-before-advance |
| Timing | Multi-weekday updates; spreadsheet/FRED often date-level |
| License | Personal & educational reproduction; not an official Fed forecast |
| Adapter | `createGdpNowProvider` |

### Cleveland Fed Inflation Nowcasting — `MODEL_NOWCAST`

| | |
| --- | --- |
| History | Public daily CPI/PCE nowcast charts |
| Timing | Business-day updates; public tables expose an **Updated** date → `DATE_ONLY` |
| License | Public research product; attribute Cleveland Fed |
| Adapter | `createClevelandNowcastProvider` |

### Philadelphia Fed SPF — `PROFESSIONAL_SURVEY`

| | |
| --- | --- |
| History | From 1968:Q4; CPI 1981:Q3+; core CPI/PCE 2007:Q1+ |
| Timing | Published deadline & results-release **dates** (`spf-release-dates`) |
| License | Informational / educational / research site terms; free download ≠ redistribution grant |
| Semantics | Quarterly annualized horizons — **not** Friday-before BLS print consensus |
| Adapter | `createSpfProvider` / `spfGrowthRowToFixture` |

### Archived public financial-news consensus — `SURVEY_CONSENSUS`

| | |
| --- | --- |
| History | Sparse, manually curated only |
| Timing | Article publish instant or date from the page itself |
| Permitted | Free public pages with explicit consensus language + timestamp (example fixture: CNBC 2023-08-09 Dow Jones CPI) |
| Rejected | Scraping Bloomberg, WSJ paywall, Econoday, Investing.com calendars, Wayback bulk reconstruction without rights |
| Adapter | `archivedNewsToFixture` / `createArchivedNewsConsensusProvider` |

### Prospective free-source collection — `SURVEY_CONSENSUS`

| | |
| --- | --- |
| History | **None** — forward captures only |
| Timing | Require source as-of or leave MISSING (no capture of null as `0`) |
| Adapter | `ProspectiveConsensusCollector` |

### FRED market-implied — `MARKET_IMPLIED`

| | |
| --- | --- |
| History | Deep daily (T5YIE / T10YIE, etc.) |
| Timing | Observation **date** only in typical FRED pulls |
| Adapter | `createMarketImpliedProvider` |

---

## Persistence

No Prisma migrations and no production DB writes in this change. Providers are
in-memory / fixture-backed. Wiring into `DataRelease` remains a later step and
must keep `consensusStatus=UNVERIFIED` unless `toConsensusEstimate` succeeds.

---

## Tests

`tests/expectationsFoundation.test.ts` — network-free, deterministic fixtures
under `tests/fixtures/expectations/`.
