# Official market-context adapters

Read-only TypeScript adapters that normalize daily market-context observations
for personal research. They do **not** write to Postgres, do **not** change the
Prisma schema, and do **not** compute regime features.

Code: `src/services/market-context/`. Shared observation contract:
`src/types/context.ts` (aligned with Agent 06 regime feature inputs and Agent 03
knowledge-mode vocabulary).

---

## Priority series

| Catalog | `seriesKey` | Unit | Primary | Mirror |
| --- | --- | --- | --- | --- |
| VIXCLS | `market:VIXCLS:level` | `index_points` | Cboe VIX CSV | FRED `VIXCLS` |
| DGS2 | `market:DGS2:yield_pct` | `pct_level` | Treasury `BC_2YEAR` | FRED `DGS2` |
| DGS10 | `market:DGS10:yield_pct` | `pct_level` | Treasury `BC_10YEAR` | FRED `DGS10` |
| DGS3MO | `market:DGS3MO:yield_pct` | `pct_level` | Treasury `BC_3MONTH` | FRED `DGS3MO` |
| T5YIE | `market:T5YIE:breakeven_pct` | `pct_level` | FRED `T5YIE` | — |
| T10YIE | `market:T10YIE:breakeven_pct` | `pct_level` | FRED `T10YIE` | — |
| DFEDTARU | `market:DFEDTARU:target_pct` | `pct_level` | FRED `DFEDTARU` | — |
| DFEDTARL | `market:DFEDTARL:target_pct` | `pct_level` | FRED `DFEDTARL` | — |

VIX / DGS2 / DGS10 keys match Agent 06 feature definitions so adapters can feed
feature math without a rename layer.

---

## Source evaluation (verified 2026-11-27)

### Cboe — VIX daily history · primary for VIX

| | |
| --- | --- |
| Endpoint | `https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv` |
| Auth | None |
| Shape | CSV `DATE,OPEN,HIGH,LOW,CLOSE`; `DATE` is `M/D/YYYY` |
| Coverage | ~1990-01-02 → present (live check returned history from 1990) |
| Definition | Daily OHLC of the Cboe Volatility Index; adapters store **CLOSE** |
| Timing | End-of-day file, updated daily. Exact wall-clock of CDN refresh is not a verified release timestamp |
| Usage | Personal / research use of the free history file; redistribution of index values is restricted under Cboe data terms — do not republish the series wholesale |
| Caveat | Pre-2003 values are **methodology backfills** of the post-2003 SPX-strip VIX, not the contemporaneous OEX-based VXO prints |

### US Treasury — Daily Par Yield Curve · primary for 3m / 2y / 10y

| | |
| --- | --- |
| Endpoint | `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=YYYY` |
| Also | `field_tdr_date_value_month=YYYYMM`; `field_tdr_date_value=all&page=N` (0-based pages) |
| Auth | None (public US government data) |
| Shape | Atom/OData XML; fields include `NEW_DATE`, `BC_3MONTH`, `BC_2YEAR`, `BC_10YEAR` (verified on 2024-01 sample) |
| Coverage | Par yield curve from 1990 |
| Definition | Daily Treasury Par Yield Curve Rates (percent) |
| Timing | Published on business days; feed `updated` is metadata, not per-observation clock. Adapters treat availability as **date-precision** |
| Usage | Public government information suitable for personal research |

### FRED — breakevens, Fed target, optional mirrors

| | |
| --- | --- |
| Endpoint | `https://api.stlouisfed.org/fred/series/observations` |
| Auth | `FRED_API_KEY` required |
| Series | `T5YIE`, `T10YIE`, `DFEDTARU`, `DFEDTARL`; mirrors `VIXCLS`, `DGS2`, `DGS10`, `DGS3MO` |
| Coverage | VIXCLS from 1990; breakevens from ~2003; target range from Dec 2008 |
| Definitions | Breakevens = Treasury nominal CM − TIPS CM spreads constructed by St. Louis Fed. `DFEDTARU`/`DFEDTARL` = FOMC target-range bounds (effective as of that calendar day; daily 7-day) |
| Timing | Observation `date` is the market/reference day. FRED “Updated” times (e.g. next-morning for VIXCLS) are release metadata on the series page, **not** returned per observation by this endpoint. Adapters therefore use conservative date-bound availability |
| Usage | Personal / educational use with citation is the historical FRED ethical baseline. **2024 FRED API Terms** additionally restrict storing, caching, archiving FRED Content and incorporating it into databases, and restrict AI/ML training uses. These adapters are fetch+normalize only: they do **not** persist to production DB. Fixtures are synthetic. Re-verify terms before any commercial redistribution or durable warehouse of FRED payloads |
| Caveat | FRED `VIXCLS` notes copyright Cboe — treat FRED as redistributor, prefer Cboe CSV as primary VIX source |

---

## Observation + retrieval contract

Adapters emit `RetrievedMarketObservation`:

1. **`observation`** — lean `MarketContextObservation` for Agent 03/06:
   `id`, `seriesKey`, `value` (`null` if missing — never `0`), `unit`,
   `observationAt`, `observationDate`, `availableAt`, optional `quality`.
2. **`retrieval`** — provenance the feature layer ignores:
   `fetchedAt`, `sourceProvider`, `sourceEndpoint` (FRED API keys redacted),
   `requestId` / `etag` when present, `rawValue`, `availabilityPrecision`,
   `parseStatus`, `knowledgeMode`.

### Availability policy (conservative)

Exact publication clocks are usually unknown for these daily feeds. Adapters:

- set `observationAt` to UTC midnight of the observation calendar date as a
  **session-day label**, not a verified clock;
- set `availableAt` to UTC midnight of the **next** calendar day as a
  conservative lower bound;
- mark `availabilityPrecision: "date"` and
  `quality: "conservative_date_bound"` (or `"missing"` when value is null).

Agent 06 PIT eligibility uses `availableAt < cutoff` (strict). Date-bound rows
are therefore not treated as usable on the observation date itself.

`KnowledgeMode` values match Agent 03/06:
`PUBLIC_INFORMATION_RECONSTRUCTION` | `SYSTEM_REPLAY`.

---

## Testing

`tests/marketContextAdapters.test.ts` is network-free. Fixtures under
`tests/fixtures/market-context/` are small synthetic payloads shaped like live
Cboe / Treasury / FRED responses. Callers inject `fetchImpl` for live use;
production code should pass `globalThis.fetch` explicitly when desired.

---

## Non-goals

- Regime percentiles, spreads, realized vol, or categorical labels
- Prisma models / migrations / production writes
- ALFRED vintage selection (Agent 03)
- Equity price adapters (separate market-price coverage work)
