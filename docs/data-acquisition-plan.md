# ImpactFeedAI — Verified Historical Data Acquisition Plan

Status: research record, verified live 2026-11-27 with read-only probes. Nothing in this document is
implemented by itself. Implementation status lives in `docs/data-sources.md` and the PRs that cite this plan.

Legend: **V** = verified by a live request in this session · **D** = from provider docs/search, not exercised · **U** = unresolved

---

## 0. Key verified findings (read these first)

1. **ALFRED reconstructs true first prints — but only per-vintage, not with `output_type=4`.** (V)
   Jan-2024 NFP: vintage 2024-02-02 gives 157,700 − 157,347 = **+353k** (the published headline).
   `output_type=4` (initial release per observation) gives 157,700 − 157,232 = +468k — **wrong**, it mixes
   the Jan first print with the Dec first print. Latest vintage gives +175k. Any MoM / YoY / QoQ "first print"
   must be computed from **one vintage snapshot** (`realtime_start = realtime_end = release date`).
2. **FRED release dates are dates only, but complete and shutdown-aware.** (V) `fred/release/dates` returns
   CPI 951 dates since 1949, PPI 602 since 1978, Employment Situation 865 since 1955, GDP 859 since 1947,
   Personal Income & Outlays 742 since 1966, including the 2025 shutdown shifts (CPI 2025-10-24, no Nov-2025
   CPI date; NFP 2025-11-20).
3. **Exact BLS timestamps exist in the archived release text back to 1995–1999.** (V; see item 4 for access limits) Every archived release
   carries an embargo line, e.g. `embargoed until 8:30 a.m. (ET) Thursday, January 11, 2024`,
   `UNTIL 8:30 A.M. (EDT) ... August 17, 1999`. Archive indexes: CPI from 1999-06, Employment Situation from 1995,
   PPI from 1998. The BLS `bls.ics` feed carries exact times (`DTSTART;TZID=US-Eastern:20250115T083000`) for
   2025–2026 only.
4. **bls.gov blocks automated clients.** (V) Requests with a plain or honest non-browser User-Agent get HTTP 403.
   The block page says bot activity that does not conform to BLS usage policy is prohibited. Sending
   browser-impersonating headers does get through, and the research probes did that once, but **that is
   circumventing an anti-bot control and must not be used by any ImpactFeedAI code.** Permitted paths: an
   operator saves the archive documents in a browser for offline parsing, or BLS confirms an acceptable
   automated method. See blockers.
5. **`BLS_API_KEY` in `.env` is empty** (length 0). (V) The API answered with "catalog/calculations disabled",
   so the pipeline runs on the anonymous tier (D: 25 queries/day, 10 years per query).
6. **Fed statements state explicit release times only from about 2017 onward.** (V) 2017-03-15 through 2024
   say "For release at 2:00 p.m. EDT/EST", and intermeeting actions say e.g. 2020-03-03 10:00 a.m. and
   2020-03-15 5:00 p.m. Releases from 1994–2015 say only "For immediate release".
7. **The SF Fed Bauer–Swanson workbook supplies FOMC announcement times and intraday surprises for 1988–2023.** (V)
   It has 361 announcements with `Time` (e.g. 2:15pm, 2:00pm, 8:30am), an `Unscheduled` flag, and 30-minute
   changes in fed funds futures, eurodollar futures, S&P futures and 2/5/10y notes. Source: frbsf.org
   `monetary-policy-surprises-data.xlsx` (updated 2026-11-25; data through 2023-12-13).
8. **The Cleveland Fed inflation nowcast publishes a daily history for each target month.** (V)
   `nowcast_month.json` has 161 target months (2013-07 → 2026-11) with nowcasts and actuals for CPI, core CPI,
   PCE and core PCE MoM. It is the only free expectation series checked that has a pre-release value for
   every CPI and PCE release. It is a **model** expectation, not a consensus.
9. **Daily market series have different, measurable publication lags.** (V, from ALFRED `realtime_start`)
   - VIXCLS, VXVCLS, NASDAQ100, DFEDTARU: first vintage is the **same day** as the observation.
   - DGS2/DGS10 (H.15): first vintage is **the next business day**.
   - SOFR: next business day. WALCL (H.4.1): Wednesday observation, Thursday vintage.
   - DTWEXBGS (broad dollar): **weekly batches, lagging 3–8 days.**
   - Treasury's own XML curve held 2026-11-25 while FRED DGS10 ended at 2026-11-24, so Treasury direct is about
     one day fresher.
10. **Yahoo intraday windows (via yahoo-finance2 3.14, V):** 1m covers the last 30 days only, 5m the last
    60 days, 1h the last 730 days (first bar 2024-11-29). Daily history: SPY from 1993, QQQ 1999, ^VIX 1990,
    ^VIX3M 2006, ^TNX 1980, DX-Y.NYB 1980, ES=F/ZN=F 2000. Raw curl to query2 returns 429 (it needs the
    crumb/cookie that the library handles).
11. **Alpha Vantage intraday by month back to 2000 works on the `demo` key** (V: IBM 5-min, `month=2009-01`).
    A free key allows 25 requests/day (D). Whether a free key, as opposed to `demo`, may make historical
    `month=` requests is **U**: it takes one test with a registered free key.
12. **Kalshi CPI, payrolls, Fed, GDP and core PCE markets have a public, keyless API**, but settled KXCPI markets
    start opening in 2026-02 (V). That gives about 12 months of history, so it is useful from now on but not
    for backtests.

---

## 1. Macro releases

### 1.1 Release identity & timestamps

| Release | Date source (V) | Exact-time source | Coverage of exact time |
|---|---|---|---|
| CPI / Core CPI | FRED `release/dates?release_id=10` | BLS archive embargo line `bls.gov/news.release/archives/cpi_MMDDYYYY.htm` (pre-2008: `/news.release/history/cpi_MMDDYYYY.txt`); index `bls.gov/bls/news-release/cpi.htm` | 1999-06 → now (V) |
| PPI | FRED `release_id=46` | BLS archive `ppi_MMDDYYYY` | 1998 → now (V index; embargo line pattern same family) |
| NFP | FRED `release_id=50` | BLS archive `empsit_MMDDYYYY` | 1995 → now (V) |
| PCE (Personal Income & Outlays) | FRED `release_id=54` | BEA ICS `bea.gov/news/schedule/ics/online-calendar-subscription.ics` (UTC `DTSTART`, e.g. `20250131T133000Z`) | 2025-01 → 2027-12 (V); **earlier exact times U** |
| GDP | FRED `release_id=53` | same BEA ICS | 2025-01 → 2027-12 (V); earlier U |
| FOMC | Fed calendar `federalreserve.gov/monetarypolicy/fomccalendars.htm` (2021+), `fomchistoricalYYYY.htm` (1936–2020) | Statement page "For release at" (≈2017+, V); **SF Fed Bauer–Swanson `Time` column 1988–2023 (V)** | 1988 → now, combined |

Rules:
- `VERIFIED` only when an official document states the time. That is the BLS embargo line, the Fed "For release
  at" line, or a BEA ICS/release PDF. The Bauer–Swanson time is peer-reviewed research and not an
  official record, so store it as `timingSource = "frbsf-bauer-swanson-2023"` with a status the policy accepts
  (proposed: `VERIFIED_SECONDARY`, or keep `INFERRED` and allow it under an explicit policy flag).
- Date-only rows (FRED release dates without a matching archive document) stay `DATE_ONLY`. **Never default to 08:30.**
- BEA before 2025: a release-PDF embargo line ("EMBARGOED UNTIL RELEASE AT 8:30 A.M. EST") exists in BEA
  news PDFs (D). Discovering the archive URLs is U, because `apps.bea.gov/histdata` is JS-driven.

### 1.2 Original vs revised values (ALFRED)

Vintage coverage (V, `series/vintagedates`):

| Metric | Series | First vintage | # vintages | Revision behavior |
|---|---|---|---|---|
| CPI headline YoY (NSA) | CPIAUCNS | 1949-03-24 | 933 | NSA effectively unrevised |
| CPI MoM (SA), what consensus quotes | CPIAUCSL | 1972-07-21 | 671 | SA factors revised every Feb for 5 yrs |
| Core CPI MoM (SA) | CPILFESL | 1996-12-12 | 378 | Jan-24 level 314.438 → 314.319 (MoM still 0.4%) |
| Core CPI YoY (NSA) | CPILFENS | 1996-12-12 | 360 | |
| PPI final demand | PPIFIS | 2014-02-19 | 159 | Revised 4 months after release; **FD index didn't exist pre-2014** |
| Payrolls | PAYEMS | 1955-05-06 | 861 | 2 monthly revisions + annual benchmark (Jan-24: +353k → +175k) |
| Unemployment | UNRATE | 1960-03-15 | 801 | SA revisions annually |
| PCE / Core PCE | PCEPI / PCEPILFE | 2000-08-01 | 318 | Monthly + annual/comprehensive |
| Real GDP | GDPC1 | 1991-12-04 | 421 | Advance/second/third + annual (Q4-23: 22672.9 → 22669.0 → 22679.3 → 22960.6) |
| GDP QoQ SAAR (BEA-computed) | A191RL1Q225SBEA | 2014-09-26 | 129 | |

Endpoint: `GET https://api.stlouisfed.org/fred/series/observations?series_id=X&realtime_start=D&realtime_end=D&observation_start=…&file_type=json&api_key=…`
- One request per (series, release date). Constraint (V): `output_type` 2/4 refuse ranges spanning more than
  2,000 vintages (DGS10 has 5,157), so chunk the realtime ranges.
- The rate limit is 120 req/min per key (D, third-party consensus). No rate headers are returned (V). The
  existing serial 0.5–0.6 s cadence is safe.
- GDP stage = the ordinal of the vintage within the quarter's first three vintages (advance/second/third). Later
  vintages are `revision`. This is derived: confirm the ordinal against BEA release names in the FRED
  release-dates list (rel 53).
- **Missing metric:** the market trades CPI **MoM SA** and core MoM SA. The registry has YoY only. Add
  `CPI_HEADLINE_MOM`, `CPI_CORE_MOM` (pct_mom), `PCE_CORE_MOM` and `PPI_FD_MOM`. Without them, every
  consensus/nowcast comparison is in the wrong unit.

### 1.3 Consensus / expectations: what actually exists for free

| Source | Metrics | History | Kind | Status |
|---|---|---|---|---|
| Cleveland Fed nowcast `clevelandfed.org/-/media/files/webcharts/inflationnowcasting/nowcast_month.json` (also `_quarter`, `_year`) | CPI, core CPI, PCE, core PCE (MoM; YoY in other files) | 2013-07 → now, daily path per target month (V) | Model nowcast | **Use**. Last value strictly before release day = expectation. Whether early history is real-time or back-filled is **U** (read `nowcasting_faqs.pdf`). |
| SF Fed Bauer–Swanson xlsx | FOMC: 30-min futures surprise, announcement time | 1988-02 → 2023-12 (V) | Market-implied surprise | **Use** for FOMC timing + surprise; it stops at 2023, so self-compute after that (blocked: needs intraday futures) |
| Same xlsx, `Monthly` sheet `NFP_SURP` | NFP surprise, keyed to the FOMC month | 1988 → 2023 (V that the column exists) | Survey-based surprise (definition **U**) | Candidate only. It is monthly and FOMC-aligned, so verify the definition before use |
| Kalshi public API `api.elections.kalshi.com/trade-api/v2/{series,markets,…}` | KXCPI, KXCPICORE, KXCPIYOY, KXPAYROLLS, KXFED, KXGDP, KXPCECORE (V) | Settled CPI markets from 2026 only (V) | Market-implied distribution | Forward capture only. Licensing **U** |
| FRED T5YIE/T10YIE, DFII10 | Breakevens / real yields | 2003 → (V) | Market-implied | Context, not a release consensus |
| Philly Fed SPF | Quarterly CPI/GDP/unemployment | 1968 → (D) | Survey | Wrong frequency for event surprise. Regime context only |
| Naive baseline (prior print, same vintage) | All | Complete | Not consensus | Label it as such |

**Conclusion:** no free source provides historical sell-side consensus (median survey) per release. The
maximum honest surprise coverage is:
- **CPI/Core CPI/PCE/Core PCE 2013-07 → now:** actual (ALFRED first print, MoM SA) minus Cleveland nowcast,
  labeled `methodology = MODEL_NOWCAST`.
- **FOMC 1988 → 2023:** Bauer–Swanson high-frequency surprise (`MARKET_IMPLIED`). From 2024 on: unavailable
  without intraday futures (or a proxy, the 2y yield daily change, labeled as such).
- **NFP, PPI, GDP:** no free pre-release expectation. Naive baseline only, unless `NFP_SURP` checks out.

This requires a schema change: `consensusStatus` needs a sibling `expectationMethodology` enum
(`SURVEY_CONSENSUS | MODEL_NOWCAST | MARKET_IMPLIED | NAIVE_BASELINE`). Without it a nowcast would be
stored as indistinguishable from a consensus.

---

## 2. Market context (daily)

| Need | Primary (V) | Coverage | Availability rule for an event at instant T |
|---|---|---|---|
| VIX | Cboe `cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv` (307 → `cdn-api.cboe.com`, follow redirects); FRED VIXCLS | 1990-01-02 → | Close of day D is usable only after 16:15 ET on D. **Both sources contain a 2026-11-26 (Thanksgiving) row**, so validate against the NYSE calendar |
| VIX3M | Cboe `VIX3M_History.csv` (2009-09-18 →); **FRED VXVCLS (2007-12-04 →)** | 2007 → | as VIX. The two sources start on different dates, so prefer FRED for depth and cross-check the overlap |
| VIX9D (bonus) | Cboe `VIX9D_History.csv` | 2011 → | |
| 2y/10y yields | **Treasury par curve** CSV `home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/{YYYY}/all?type=daily_treasury_yield_curve&field_tdr_date_value={YYYY}&_format=csv`, XML `.../pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value_month=YYYYMM` | 1990-01-02 → (2Y present 1990; 1990 lacks 1M/2M/20Y columns) | Treasury publishes the same evening (D: ~3:30 PM quotes). FRED/H.15 for date D appears on D+1 (V). For an 08:30 release on day D, use the D−1 curve from Treasury, or D−2 if only FRED/H.15 is available |
| 2y/10y alt | FRED DGS2/DGS10; Fed DDP `federalreserve.gov/datadownload/Output.aspx?rel=H15&series=bf17364827e38702b42a58cf8eaa3f78&filetype=csv&…` (V) | DGS2 1976, DGS10 1962 | H.15 next-business-day lag (V) |
| Curve spreads | Compute from the same-date pair (2s10s, 3m10y). FRED T10Y2Y/T10Y3M as a cross-check | 1976 / 1982 | Same observation date required |
| SPY, QQQ | Yahoo daily via yahoo-finance2 | SPY 1993, QQQ 1999 | Record the basis: daily OHLC split-adjusted, adjclose split+div (repo already documents this) |
| Index alt | FRED NASDAQ100 (1986), NASDAQCOM (1971); **SP500 limited to a rolling 10 years** by the S&P DJI license note (V) | | Same-day vintage (V) |
| DXY | Yahoo DX-Y.NYB daily (1980) | | ICE index via Yahoo, licensing U |
| Dollar (official) | FRED DTWEXBGS / DTWEXAFEGS (2006 →) | | **Published weekly with a 3–8 day lag (V).** Not usable for "previous day" context without that lag |
| Policy rate | DFEDTAR (1982-09-27 → 2008-12-15), DFEDTARU/DFEDTARL (2008-12-16 →), EFFR (2000), DFF (1954), IORB (2021), SOFR (2018) | | Target series: same-day vintage, so pair with the FOMC timestamp. A target change effective on day D+1 was announced on day D |
| Balance sheet | WALCL, WRESBAL (2002-12-18 →, weekly Wed), RRPONTSYD (2003) | | H.4.1 Wednesday level, vintage Thursday (V) (D: released 16:30 ET) |
| Treasury auctions (event type) | `api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/auctions_query` | 1979-10-31 →, 6,367 rows (V) | Includes `closing_time_comp` ("01:00 PM"). **TIPS reopenings appear as security_type "Note"** (2024-01-18 "10-Year" at 1.81%), so filter `inflation_index_security` |

---

## 3. Market reactions (intraday)

| Provider | Resolution / depth | Cost / limit | Verdict |
|---|---|---|---|
| Yahoo (yahoo-finance2) | 1m: 30 days; 5m: 60 days; 1h: 730 days; daily: decades (V) | Free, unofficial, ToS U | **Archive forward now.** Run a scheduled job that persists 1m bars for the core symbols (SPY, QQQ, ES=F, ZN=F, ^VIX, DX-Y.NYB, ^TNX) every ≤7 days, so the history accumulates. Every day without this job is intraday history lost for good |
| Alpha Vantage | 1/5/15/30/60-min, any month since 2000-01, `extended_hours`, `adjusted` flag (V on demo key) | Free key 25 req/day (D) → one symbol-month per request; SPY at 5-min since 2000 ≈ 320 requests ≈ 13 days of quota per symbol | **Best free deep-intraday source for SPY/QQQ** if the free key is allowed `month=` (U, one test settles it). ETFs only: no ^VIX, futures or yields |
| Massive (ex-Polygon) Basic | Minute aggregates, 2 years, 5 calls/min, end-of-day (D) | Free | Useful for 2024-11 → now cross-validation. 2 years is no deeper than Yahoo 1h, at better resolution |
| Dukascopy datafeed `datafeed.dukascopy.com/datafeed/{INSTR}/{YYYY}/{MM-1}/{DD}/{HH}h_ticks.bi5` | Tick, 24h CFDs (USA500IDXUSD, USTBONDTRUSD, DOLLARIDXUSD) | Free; returned 503 then 429 "Too Many Requests" (V). They point to `wiki.dukascopy.com/en/development/data-export/` | **U.** It would be the only free 24h index proxy for 08:30 releases. CFD prices are not exchange data, so label them as a proxy |
| Stooq | Daily CSV | Free | **Now behind a JS browser check (V)**, so it is not scriptable |
| Cboe delayed-quote charts JSON | Intraday VIX | | Cloudflare challenge (V), so not usable |
| Databento | Tick/1m, CME from 2010, Nasdaq ITCH from 2018 | Paid, with one-time signup credit (D, U amount) | Out of scope (purchase); best upgrade path for ES/ZN at 08:30 |

**Hard limit without purchasing:** no free source provides historical intraday **futures** (ES/NQ/ZN) or
intraday Treasury yields older than about 2 years. For pre-2024-11 events, the trustworthy reaction windows are:
- daily close-to-close (all assets, decades)
- SPY/QQQ intraday from Alpha Vantage, regular-session plus extended hours (if the free key allows it)
- FOMC 30-minute futures/notes windows from Bauer–Swanson (1988–2023, precomputed only)

---

## 4. Maximum trustworthy dataset without purchases

| Block | Span | Trust level |
|---|---|---|
| CPI/Core CPI release events with exact time + first-print MoM/YoY + Cleveland nowcast surprise | **2013-07 → now** (≈160 releases) | Exact time V (BLS), first print V (ALFRED), expectation = model |
| CPI/Core CPI events with exact time + first print, no expectation | 1999-06 → 2013-06 | V |
| NFP with exact time + first print (+353k-style, same vintage) | 1995 → now | V; no expectation |
| PPI final demand | 2014-02 → now (FD index); 1998–2014 only on legacy PPI-FG, which is a different series | V |
| PCE/Core PCE first print + nowcast | 2013-07 → now; exact time 2025 → (earlier `DATE_ONLY` until BEA PDFs are parsed) | partial |
| GDP advance/second/third | 1991-12 → now; exact time 2025 → | partial |
| FOMC decisions incl. holds, exact time, intermeeting flag, 30-min market surprise | 1988-02 → 2023-12 (Bauer–Swanson) + 2017 → now (statement times) + calendar pages | V |
| Daily context (VIX, VIX3M, 2y, 10y, spreads, SPY, QQQ, DXY, policy rate, WALCL, RRP) | 2007-12 → now for the full set (VIX3M is the binding series); 1993 → without VIX3M | V, with per-series availability lag |
| Intraday reactions | 1h: 2024-11-29 → now (Yahoo); 1m/5m: rolling from today forward if archived; SPY/QQQ 1/5-min 2000 → only if AV free key works | V / U |

---

## 5. Prioritized implementation plan

Each milestone is independently shippable. Schema additions follow the existing Phase-1 plan's
`ContextSeries` / `ContextObservation` direction. Do not rewrite `DataRelease`; add to it.

### P0 — Unblock (hours)
- Register a free BLS key and set `BLS_API_KEY` (currently empty). Register an Alpha Vantage key and run one
  `month=2009-01` request on SPY to settle the free-tier question.
- **Accept:** BLS response includes catalog data; the AV response returns bars or an explicit premium message,
  and the result is recorded in data-sources.md.

### P1 — Intraday archive job (start immediately; the cost of waiting is permanent)
- A scheduled `scripts/ingest/archive-intraday.ts` that pulls Yahoo 1m (7-day chunks) + 5m for SPY, QQQ,
  ES=F, NQ=F, ZN=F, ^VIX, ^VIX3M, ^TNX, DX-Y.NYB into the existing `candles` table (already has
  session/basis/provider/fetchedAt).
- **Accept:** a re-run is idempotent; the gap check reports zero missing regular-session minutes for the last
  7 days per symbol; extended-hours volume stays NULL; the job runs at least weekly.

### P2 — Release calendar with exact timestamps
- Adapter A: FRED `release/dates` for release_ids 10, 46, 50, 53, 54, which gives date skeletons.
- Adapter B: BLS archive index pages, then each release's embargo line, parsed with a regex for
  `(\d{1,2}:\d{2}) ?(a\.m\.|A\.M\.) \((ET|EDT|EST)\)`, producing `VERIFIED` with the archive URL as
  `timingSource`. The adapter **parses operator-saved documents only and never fetches bls.gov** (see blocker 2).
- Adapter C: BEA ICS for 2025+ (`www.bea.gov` permits crawling; `apps.bea.gov/robots.txt` disallows `/`, so the BEA
  historical-data archive is out of bounds).
- Adapter D: FOMC, from Bauer–Swanson (1988–2023) + statement "For release at" (2017+) + calendar pages
  for holds and dates.
- **Schema:** `ReleaseCalendarEntry { releaseKey (e.g. bls:cpi), referencePeriod, releaseDate, releaseAt?,
  timingStatus, timingSourceUrl, evidenceText (the embargo line), fetchedAt }`, unique (releaseKey,
  referencePeriod).
- **Accept:** every BLS release date in FRED 1999+ (CPI), 1995+ (NFP) and 1998+ (PPI) either has a
  matching embargo time or a logged reason. Spot-check 10 dates by hand (including 2025-10-24, 2025-11-20, and
  the 1996 shutdown dates). Zero rows default to 08:30.

### P3 — First-print + revision store (ALFRED)
- For each calendar entry: one per-vintage request per series on the release date. Compute the canonical
  value from that single snapshot. Store the raw levels too.
- **Schema:** `ReleaseValue { calendarEntryId, metricKey, vintageDate, stage (initial|second|third|annual|latest),
  value, unit, rawLevels jsonb, sourceUrl (key redacted), fetchedAt }`, unique (calendarEntryId, metricKey, stage).
  `DataRelease.actualValue` = the `initial` stage.
- New metrics: CPI/core CPI MoM SA, PCE/core PCE MoM, PPI FD MoM.
- **Accept (golden tests):** Jan-2024 NFP = +353k (initial) / +175k (latest); Jan-2024 CPI MoM 0.3, core 0.4;
  Q4-2023 GDPC1 levels 22672.859 / 22668.986 / 22679.255 by stage. A test asserts that `output_type=4`
  differencing is never used.

### P4 — Daily context observations
- Series: Treasury par curve (primary for 2Y/10Y), Cboe VIX/VIX3M/VIX9D CSVs + FRED VIXCLS/VXVCLS
  cross-check, DGS2/DGS10, T10Y2Y, T10Y3M, DFEDTAR+DFEDTARU/L, EFFR, SOFR, IORB, WALCL, WRESBAL,
  RRPONTSYD, DTWEXBGS, T5YIE/T10YIE, and Yahoo daily SPY/QQQ/DX-Y.NYB.
- Store `availableAt` from a per-series policy derived from the measured lags in §0.9 (Treasury: D 18:00 ET
  conservative; H.15/FRED yields: D+1 business day 16:15 ET; VIX: D 16:15; WALCL: Thu 16:30; DTWEXBGS: ALFRED
  realtime_start).
- **Accept:** a context query for an 08:30 CPI on day D never returns a yield dated D, and never a FRED yield
  dated D−1. Holiday rows (VIX on 2026-11-26) are flagged. Treasury vs FRED 2Y/10Y differences on overlapping
  dates are ≤ 1 bp, or the row is quarantined.

### P5 — Expectations
- Cleveland nowcast ingest: per target month, take the last daily value dated strictly before the release
  date, with `expectationMethodology = MODEL_NOWCAST`.
- Bauer–Swanson FOMC surprises, `MARKET_IMPLIED`.
- Kalshi forward capture: daily snapshot of open CPI/NFP/FOMC markets, from now on.
- **Accept:** each CPI release 2013-07+ has a nowcast or a logged gap (expect gaps around the Oct/Nov-2025 BLS
  outage, which Cleveland documents in a methodology PDF). No nowcast is ever stored with consensusStatus
  `VERIFIED`.

### P6 — Deep intraday for SPY/QQQ (conditional on P0)
- Alpha Vantage `TIME_SERIES_INTRADAY&interval=1min|5min&month=YYYY-MM&extended_hours=true&adjusted=false`,
  only for months containing an event, at 25 per day.
- **Accept:** basis recorded as AS_TRADED (`adjusted=false`). For any overlapping 1h window, the reconciliation
  vs Yahoo is within 0.05%.

---

## 6. Unresolved blockers

1. **Historical sell-side consensus**: no free source exists. NFP, PPI and GDP surprises stay unavailable
   (naive baseline only). This is the thesis-level gap and needs a decision on purchase vs. model expectations.
2. **BLS website automation is blocked for non-browser clients**, and impersonating a browser is not permitted.
   Options: operator-saved documents (manual, about 1,000 pages for full depth), or written confirmation from BLS of
   an acceptable automated method. Until then, BLS release timing beyond what an operator supplies stays at
   FRED-reconciled `DATE_ONLY`. No published BLS policy defining an acceptable automated client was found.
3. **Alpha Vantage free-key historical intraday**: U, settled by one request with a real key. Terms for storing
   the data: U.
4. **Cleveland nowcast early history**: whether 2013–2014 values are real-time or reconstructed is U (read
   `nowcasting_faqs.pdf` / users guide).
5. **BEA exact times before 2025**: U. Needs release-PDF discovery; until then those releases stay `DATE_ONLY`.
6. **FOMC 2024+ surprises and all intraday futures**: blocked without paid futures data. Dukascopy CFD access
   is U (rate-limited during testing).
7. **Licensing**: Yahoo (unofficial), Cboe CSV terms, ICE DXY via Yahoo, S&P series on FRED (10-year cap,
   noted in the series), Kalshi data terms. This is fine for a personal research terminal and **not cleared for
   redistribution**.
8. **Bauer–Swanson `NFP_SURP` definition and units**: U. Verify against the paper (`hfdat.pdf`) before use.
