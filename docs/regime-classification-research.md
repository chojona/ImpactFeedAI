# Regime classification — academically defensible methods

Status: **research note only**. No implementation, no production claims, and no
forecast or trading-signal claims. This document proposes interpretable,
point-in-time features and empirical checks that can later inform Phase 2
regime tagging in [research-methodology.md](research-methodology.md).

Premise (unchanged from the methodology doc): a regime label is a compression.
Store continuous features beside any categorical label; compute both only from
information available at the cutoff; treat labels as descriptive conditioning
variables for historical analogs, not as predictions.

---

## 1. What “regime” means here

A **regime** is a discrete or continuous state that summarizes macro-financial
conditions that are already observable at a cutoff. Three families of methods
appear in the academic and official literature. They are not interchangeable.

| Family | What it produces | Strength | Weakness for this product |
| --- | --- | --- | --- |
| **Observable rule-based features** | Continuous levels/changes/percentiles; optional categorical compressions | Interpretable, replayable, easy to lineage | Any cutpoint is a research choice and must be versioned + sensitivity-tested |
| **Latent statistical regimes** (Markov-switching, MS-VAR) | Filtered/smoothed state probabilities | Endogenous, statistically estimated thresholds | Harder to explain; smoothed states use future data unless strictly filtered |
| **External chronologies** (NBER dates, official indexes) | Expert or institutional state labels | Credible external benchmarks | Often revised or announced with lag; unsuitable as sole real-time inputs |

**Recommendation for ImpactFeedAI:** prioritize family 1 for product features;
use family 2 only as optional research diagnostics; use family 3 as **validation
targets**, never as look-ahead labels for pre-event context.

---

## 2. Point-in-time availability rules (non-negotiable)

These rules follow Croushore–Stark real-time data principles and ALFRED vintage
practice (Philadelphia Fed RTDSM; St. Louis Fed ALFRED). They also match the
look-ahead defenses already stated in [research-methodology.md](research-methodology.md).

1. **Cutoff is strict.** An observation enters a feature only if its
   `availableAt` (or a documented conservative bound) is strictly before the
   event cutoff. Publication date ≠ reference period.
2. **Use the vintage available at the cutoff**, not today’s revised panel.
   ALFRED / Philadelphia Fed RTDSM are the primary reconstruction tools for
   macro actuals. Latest-vintage FRED/BLS panels are descriptive only.
3. **Separate filter from smoother.** For latent models (Hamilton 1989), only
   the real-time filter \(P(S_t \mid y_1,\ldots,y_t)\) is admissible for
   historical context. Full-sample smoothed probabilities are ex post
   diagnostics.
4. **Market bars complete only at their close.** A daily close dated \(t\) is
   unavailable during session \(t\). H.15 / FRED Treasury dissemination timing
   is not equity-session close.
5. **No invented clocks.** If only a vintage *date* is known, either exclude
   same-day use or apply an explicit end-of-date conservative bound with status
   `conservative_date_bound`. Never assign conventional 08:30/14:00 times
   without independent evidence.
6. **Missing is null.** Insufficient history, unknown availability, or
   incompatible units → explicit unavailable status, never a fabricated 0 or
   default regime.
7. **Knowledge mode is part of identity.** Distinguish *system replay* (local
   receipt before cutoff) from *historical public reconstruction* (archived
   vintage evidence). Do not conflate them.

---

## 3. Method families by domain

### 3.1 Growth / business cycle

**Academic / institutional anchors**

- Hamilton (1989, *Econometrica*): two-state Markov switching in GDP growth;
  filtered recession probabilities align closely with NBER chronology without
  hard-coding NBER dates into the model.
- Bry–Boschan (1971) / Harding–Pagan quarterly variants: algorithmic turning
  points with minimum phase/cycle lengths; the algorithmic backbone behind
  much NBER-style dating research.
- Sahm Rule (Sahm; published on FRED as `SAHMREALTIME` / `SAHMCURRENT`):
  three-month average unemployment rate ≥ 0.50 pp above its prior-12-month
  low. The **real-time** series is built from unemployment vintages available
  each month — a rare official example of an explicitly point-in-time regime
  indicator.
- Chicago Fed National Activity Index (CFNAI): diffusion of real activity;
  used in macro-environment research (e.g. Ilmanen–Israel–Moskowitz style
  growth composites) as a continuous growth factor.

**Proposed features (prefer continuous)**

| Feature key | Definition | PIT rule |
| --- | --- | --- |
| `gdp_qoq_saar` | Latest eligible real GDP QoQ SAAR on a consistent estimate stage | Advance/second/third are distinct; use vintage as of cutoff |
| `gdp_accel` | Change in QoQ SAAR vs prior eligible quarter, same vintage basis | Both quarters selected as-of cutoff |
| `unrate_level` | Latest eligible U-3 unemployment rate | Prefer ALFRED/real-time; note January seasonal-factor revisions |
| `sahm_gap` | 3m avg UNRATE − min(3m avg over prior 12 months) | Prefer published `SAHMREALTIME` or recompute from real-time UNRATE vintages |
| `payroll_3m_mean` | Mean of last three monthly nonfarm changes | Vintage-consistent PAYEMS transforms |
| `cfnai_level` | Latest eligible CFNAI (if sourced) | Respect Chicago Fed publication lag |

**Categorical compressions (optional, versioned)**

- Growth direction from signed GDP QoQ (expanding / contracting / flat at
  exact 0). This is arithmetic, not a recession call.
- Sahm signal as a binary gate **only when** documenting the official 0.50 pp
  rule and citing Sahm/FRED. Treat the threshold as an external published rule,
  not a free parameter of this product. Always retain `sahm_gap` continuously.

**Do not claim:** that a growth label forecasts recession or asset returns.
Validation against NBER dates is a historical concordance check, not proof of
causal prediction.

### 3.2 Inflation

**Academic / institutional anchors**

- Central-bank practice: inflation level relative to an explicit target (Fed
  longer-run 2% PCE objective) and change in inflation (acceleration).
- Baele–Van Holle and ECB Financial Stability Review work: inflation *level*
  and policy interaction matter more for stock–bond correlation regimes than
  growth alone.
- Ilmanen et al. (AQR / *Journal of Portfolio Management*): growth × inflation
  environment maps as continuous z-scored factors; they emphasize publication
  lag and revision issues and use longer windows partly for that reason.

**Proposed features**

| Feature key | Definition | PIT rule |
| --- | --- | --- |
| `infl_yoy` | Latest eligible YoY inflation in canonical metric unit (core PCE preferred for policy; CPI for BLS-event context) | Metric identity required; vintage as-of cutoff |
| `infl_vs_target` | `infl_yoy − target` (document target series/version, e.g. 2.0 PCE) | Target is a policy constant, not a data observation |
| `infl_accel_3m` | YoY now − YoY three monthly observations earlier, same metric | Seven monthly headline values not required; three spaced YoY prints are |
| `infl_persist` | Count of positive MoM or YoY changes over a fixed lookback (declare which) | Version the definition; report both positive and non-positive counts |
| `breakeven_5y` / `breakeven_10y` | FRED `T5YIE` / `T10YIE` when eligible | Market series; not a survey consensus |

**Categorical compressions**

Avoid fixed “hot/cold” absolute CPI cutoffs. Prefer:

- acceleration sign with a **dead zone treated as research sensitivity**, not
  truth (document candidate bands such as ±0.1 pp and test robustness); or
- trailing percentile of `infl_yoy` / `infl_accel_3m` over a fixed lookback
  (e.g. 120 monthly observations), which adapts without a hard economic
  constant.

**Do not claim:** accelerating inflation “implies” equity or bond direction.
Literature links inflation regimes to *correlation structure* and discount-rate
channels; that is descriptive association, not a trading rule.

### 3.3 Monetary policy

**Academic / institutional anchors**

- Laubach–Williams (2003) and Holston–Laubach–Williams updates (NY Fed r\*
  page): natural real rate \(r^*\); stance ≈ real policy rate − \(r^*\).
- IMF (2025) *How to Measure the Monetary Policy Stance*: accommodative if
  \(r < r^*\), restrictive if \(r > r^*\); emphasizes model uncertainty and
  judgment.
- Ang–Bekaert interest-rate regime switching: short-rate dynamics switch
  between “normal” smoothing and high-rate/high-vol “inflation-fighting”
  states — useful as research context, not as a UI label without filter-only
  probabilities.
- Target-range path (`DFEDTARU` / FOMC decisions): observable direction of
  *realized* policy, distinct from market expectations.

**Proposed features**

| Feature key | Definition | PIT rule |
| --- | --- | --- |
| `ff_target_upper` | Latest eligible target upper bound | Announcement evidence preferred over inferred clocks |
| `ff_change_90d` | Upper bound now − last eligible observation ≤ 90 calendar days earlier | Direction of realized policy: tightening / easing / unchanged |
| `real_ff` | Nominal short rate − inflation expectation proxy (document proxy: SPF, breakeven, or trailing YoY) | Proxy methodology is part of feature version |
| `rstar_gap` | `real_ff − r*` using a named r\* vintage (HLW) | Only if the r\* estimate’s publication/as-of is known; otherwise unavailable |
| `policy_path_unavailable` | Explicit status when OIS/futures history is not validated | Do not invent “priced cuts” |

**Important labeling rule (already in the Phase 1 plan language):**

- `ff_change_90d` may be labeled higher / lower / unchanged.
- **Do not** label restrictive / neutral / accommodative unless a named
  neutral-rate model and its as-of vintage are attached. IMF and Fed research
  both stress that \(r^*\) is unobserved and model-dependent.

### 3.4 Yield curve / rate environment

**Academic / institutional anchors**

- Estrella–Hardouvelis (1991, *Journal of Finance*): term spread (classically
  10y − 3m) relates to subsequent real activity.
- NY Fed Current Issues / FAQ literature: 10y−3m spread’s historical link to
  NBER recessions; also notes that **theory links the continuous spread to
  activity**, while “inversion ⇒ recession” is an empirical regularity about
  extremes, not a theorem.
- Rosenberg–Ma (NY Fed): term premium vs expectations components can change
  the signal — store the raw spread; do not silently convert to a recession
  probability in the product.
- Ang–Bekaert–Wei: regime-switching term structure separating real rates,
  expected inflation, and inflation risk premia.

**Proposed features**

| Feature key | Definition | Unit / PIT |
| --- | --- | --- |
| `dgs2`, `dgs10`, `dgs3m` | Same-date eligible constant-maturity yields | Percent; aligned business dates |
| `spread_2s10s` | `100*(DGS10−DGS2)` | bp |
| `spread_3m10y` | `100*(DGS10−TB3MS or DGS3MO)` | bp; document bill series |
| `yield_chg_5`, `yield_chg_20` | Change over 5/20 source business days | bp |
| `curve_chg_20` | Change in chosen spread over 20 business days | bp (steepening/flattening continuous) |

**Categorical compressions**

- Sign of spread (inverted / non-inverted) is a transparent arithmetic label
  of the continuous spread. Prefer storing the bp spread always.
- Do **not** ship a “recession probability from the curve” in Phase 1/2 without
  a separately versioned, holdout-tested model and clear non-causal wording.

### 3.5 Volatility

**Academic / institutional anchors**

- Andersen–Bollerslev–Diebold realized-volatility literature; Bollerslev–Gibson–Zhou
  (*Journal of Econometrics*): model-free implied vs realized volatility and
  variance risk premia.
- Bekaert–Hoerova: VIX decomposition into expected volatility and variance
  premium components.
- Practitioner/academic caution: **full-sample** VIX percentile thresholds are
  ex post (they use future VIX to set the cut used on past days). Trailing-window
  percentiles are the causally admissible alternative.

**Proposed features**

| Feature key | Definition | PIT rule |
| --- | --- | --- |
| `vix_level` | Latest eligible daily VIX close (`VIXCLS`) | Daily close availability only |
| `vix_pct_trailing` | Percentile of latest VIX within prior \(N\) observations **excluding** today or with a declared tie rule | Require complete window; no full-sample percentile for historical labels |
| `rv_20`, `rv_60` | Sample SD (`ddof=1`) of log returns × √252 × 100 | Complete sessions only; declare annualization |
| `iv_minus_rv20` | VIX − trailing equity RV20 | Horizon mismatch disclosed; **not** claimed as a clean VRP estimate without high-frequency RV |

**Categorical compressions**

If a low/normal/high label is needed for UI compression:

- Prefer trailing quantiles (e.g. below 33rd / between / above 67th of the
  trailing 252-day VIX window), citing the rolling-quantile approach used in
  recent regime-aware portfolio research.
- Treat quantile choice (terciles vs quintiles vs 20/80) as a **sensitivity
  parameter**, not a discovered economic constant.
- Reject fixed “VIX > 30 = crisis” as a primary rule; absolute levels are
  era-dependent (explicitly noted in research-methodology.md).

### 3.6 Liquidity / financial conditions

**Academic / institutional anchors**

- Chicago Fed NFCI (Brave–Butters factor methodology): weekly index of money,
  debt, equity, and banking conditions; positive = tighter than average.
- Adrian–Boyarchenko–Giannone (NY Fed Staff Report 794, “Vulnerable Growth”):
  tighter financial conditions associate with fatter **left** tails of future
  GDP growth (quantile regressions). Upper quantiles are comparatively stable.
- Same authors’ multimodality work: sharp financial tightenings can induce
  non-Gaussian macro-financial regimes.

**Proposed features**

| Feature key | Definition | PIT rule |
| --- | --- | --- |
| `nfci_level` | Latest eligible NFCI | Weekly publication lag; Chicago Fed release timing |
| `anfci_level` | Adjusted NFCI (if used) | Same |
| `nfci_chg_4w` | 4-week change | Continuous tightening/loosening |
| `ted_spread` / money-market spreads | Only if series continuity and definition breaks are handled | Document discontinuities (LIBOR era vs SOFR) |

**Categorical compressions**

Prefer continuous NFCI and its trailing percentile. A binary “tight/loose”
around zero is the index’s own historical normalization, not an ImpactFeedAI
invention — still store the continuous value.

**Do not claim:** NFCI forecasts crash timing. The official research result is
about **conditional downside risk to growth**, which is a distributional
association.

### 3.7 Cross-asset behavior

**Academic / institutional anchors**

- Baele–Van Holle: stock–bond correlations associate strongly with **monetary
  policy stance**; negative correlations appear mainly under accommodating
  policy *and* low inflation; restrictive policy associates with positive
  correlations across inflation/growth states.
- ECB FSR (Nov 2022): stock–bond correlation rises with inflation away from
  ~2% and with policy-tightening expectations (discount-rate channel).
- Ilmanen–Kaplan–Li (and related AQR work): inflation and real rates help
  explain long-run stock–bond correlation regimes.
- Ilmanen et al. macro-sensitivity maps: equities prefer high growth; bonds
  prefer low inflation; commodities prefer high inflation — reported as
  sample Sharpe variation across environments, with explicit sample/design
  caveats.

**Proposed features**

| Feature key | Definition | PIT rule |
| --- | --- | --- |
| `sb_corr_60`, `sb_corr_252` | Rolling correlation of daily equity and Treasury-proxy returns | Same calendar endpoints; declare proxies (e.g. SPY vs TLT or duration-matched synthetic from yield changes) |
| `equity_ret_20/60/252` | Simple returns on declared basis | Complete sessions |
| `rel_strength_20` | Instrument return − SPY return, identical endpoints | Compatible basis/currency only |
| `drawdown_252` | Close / rolling 252-day max − 1 | ≤ 0 |
| `trend_structure` | Optional: price vs SMA50 vs SMA200 as **descriptive** structure | Require full lookback; equality → mixed |

**Growth × inflation environment (2×2 map)**

A classic “investment clock” style map is defensible **only** as a joint
labeling of two continuous factors (e.g. signs or trailing percentiles of
growth and inflation surprises/levels), with:

- contemporaneous or lagged windows declared;
- publication-lag acknowledgment (Ilmanen et al.);
- no claim that quadrant membership forecasts next-period asset returns in
  this product.

Prefer showing the two continuous axes and optional quadrant as a view, not
as a predictive state machine.

---

## 4. Feature design principles (to avoid arbitrary thresholds)

1. **Continuous first.** Every categorical label must point at one or more
   stored continuous features a user can inspect.
2. **External thresholds only when published.** Sahm’s 0.50 pp and NFCI’s
   zero mean are external conventions. Product-invented cutpoints require
   version IDs and sensitivity grids.
3. **Trailing, not full-sample, ranks.** Percentiles and z-scores for
   historical labeling use only data available at the cutoff.
4. **Declare windows, units, bases, and annualization.** `ddof`, 252 vs 365,
   price-adjustment basis, and metric canonical units are part of the feature
   contract (see project data-integrity rules).
5. **No silent mixing of expectation concepts.** Survey consensus, model
   nowcast, and market-implied pricing are different objects
   ([data-sources.md](data-sources.md)).
6. **Compress late.** Similarity and analog research should mostly operate on
   continuous, normalized features; discrete regimes are UI/conditioning aids.

---

## 5. Empirical validation methods (descriptive, not predictive product claims)

Validation answers: *Is this feature measuring a coherent, stable, point-in-time
state?* It does **not** authorize phrases like “this regime predicts X.”

### 5.1 Integrity tests (required before any research use)

| Test | Pass criterion |
| --- | --- |
| Vintage invariance | Freezing a cutoff and appending later revisions does not change the reconstructed feature |
| Strict cutoff | Observations with `availableAt >= cutoff` never enter |
| Null discipline | Missing inputs yield null/unavailable, never 0 |
| Concordance of units | Features refuse mixed units/bases |
| Knowledge-mode separation | System-replay and public-reconstruction outputs differ when local receipt lags public publication |

### 5.2 Concordance with external chronologies (optional diagnostics)

- Compare filtered Hamilton recession probabilities or Sahm signals to NBER
  peak–trough dates using **lag-aware** metrics (NBER announcements are
  delayed). Report lead/lag, hit rate, and false positives without claiming
  superiority for trading.
- Compare yield-spread sign changes to subsequent NBER episodes as a
  literature replication (Estrella–Hardouvelis / NY Fed), clearly labeled as
  historical association.

### 5.3 Stability and sensitivity

- **Window grid:** recompute percentiles/z-scores for nested lookbacks (e.g.
  126/252/504 sessions; 36/60/120 months). Report rank correlation of the
  continuous feature across windows.
- **Cutpoint grid:** if a categorical label exists, sweep nearby thresholds
  and report how often labels flip. Large flip rates ⇒ prefer continuous-only
  presentation.
- **Subsample eras:** pre-GFC, GFC, ZIRP, post-2022 inflation — feature
  means/variances will differ; that is expected. Document rather than “fix”
  by changing definitions per era.

### 5.4 Association tests with market *outcomes* (research only)

If studying whether regimes condition event reactions:

- Pre-register the reaction window and asset set.
- Compare outcome **distributions** (median, IQR, tails), not only means.
- Always show \(n\); degrade confidence language for small cells.
- Hold out a time block; treat in-sample threshold tuning as overfitting risk
  (methodology doc).
- Multiple-comparison awareness: many regime × event-type × window cells will
  produce spuriously “significant” differences.
- Report associations as “historical conditional distributions,” never as
  actionable signals.

### 5.5 Cross-asset structure tests

- Replicate the qualitative Baele–Van Holle / ECB pattern: rolling stock–bond
  correlation vs inflation level and policy-stance proxies.
- Success metric: qualitative concordance and stable partial associations —
  not out-of-sample portfolio alpha.

---

## 6. Proposed v1 research feature set for ImpactFeedAI

Aligned with sources already planned in [data-sources.md](data-sources.md)
(FRED VIX/yields, equity proxies, ALFRED macro vintages). Ordered by
defensibility given current data gaps.

### Tier A — implementable once point-in-time market series exist

1. VIX level + trailing percentile  
2. Equity RV20/RV60 + optional IV−RV spread (disclosed as crude)  
3. DGS2/DGS10 levels, 2s10s, 5/20d yield changes  
4. Equity returns, drawdown, optional SMA structure  
5. Rolling stock–bond correlation (proxy-based)

### Tier B — requires vintage-aware macro

6. Inflation YoY, vs-target gap, acceleration  
7. Labor: UNRATE, payroll 3m mean, Sahm gap (real-time)  
8. GDP QoQ SAAR + acceleration with estimate-stage discipline  
9. Policy direction from target-rate path (`ff_change_90d`)

### Tier C — only with extra model/source provenance

10. \(r^*\) gap (HLW vintage as-of)  
11. NFCI level/change  
12. Market-implied policy path (OIS/futures)  
13. Verified surprise z-scores (blocked on consensus coverage)

### Explicit non-goals for early regime work

- Latent Markov labels in the UI  
- Recession probability widgets from the yield curve  
- “Risk-on / risk-off” without a precise definition  
- Any statement that a regime forecast returns or improves trading P&L

---

## 7. Mapping to product phases

| Phase | Role of this research |
| --- | --- |
| Integrity gates / Phase 1 context plumbing | Temporal contract, continuous Tier A/B features, lineage — **no** predictive validation |
| Phase 2 regime tags | Versioned categorical compressions of Tier A/B continuous features; sensitivity grids |
| Later similarity / analogs | Continuous features dominate similarity; regimes are optional filters with visible \(n\) |

This ordering matches [research-methodology.md](research-methodology.md):
regimes condition analogs; they are not forecasts.

---

## 8. Source bibliography (primary)

### Academic

- Hamilton, J. D. (1989). “A New Approach to the Economic Analysis of Nonstationary Time Series and the Business Cycle.” *Econometrica*.
- Bry, G., & Boschan, C. (1971). *Cyclical Analysis of Time Series: Selected Procedures and Computer Programs*. NBER.
- Estrella, A., & Hardouvelis, G. A. (1991). “The Term Structure as a Predictor of Real Economic Activity.” *Journal of Finance*.
- Ang, A., & Bekaert, G. (1998/2002). Regime switches in interest rates / short-rate nonlinearities.
- Ang, A., Bekaert, G., & Wei, M. (2008). “The Term Structure of Real Rates and Expected Inflation.” *Journal of Finance*.
- Laubach, T., & Williams, J. C. (2003). “Measuring the Natural Rate of Interest.” *Review of Economics and Statistics* (and NY Fed HLW updates).
- Bollerslev, T., Gibson, M., & Zhou, H. (2011). “Dynamic Estimation of Volatility Risk Premia…” *Journal of Econometrics*.
- Bekaert, G., & Hoerova, M. (2014). “The VIX, the Variance Premium and Stock Market Volatility.” *Journal of Econometrics*.
- Baele, L., & Van Holle, F. “Stock-Bond Correlations, Macroeconomic Regimes and Monetary Policy.”
- Ilmanen, A., et al. “Exploring Macroeconomic Sensitivities…” *Journal of Portfolio Management* / AQR.

### Official / institutional

- Croushore, D., & Stark, T. Philadelphia Fed Real-Time Data Set for Macroeconomists.
- St. Louis Fed ALFRED vintage documentation.
- Sahm, C. Sahm Rule; FRED `SAHMREALTIME`.
- Federal Reserve Bank of New York: Estrella yield-curve notes; Adrian–Boyarchenko–Giannone Staff Reports 794/903; r\* / HLW portal.
- Chicago Fed: NFCI methodology (Brave–Butters).
- ECB Financial Stability Review (Nov 2022): cross-asset correlations box.
- IMF (2025). “How to Measure the Monetary Policy Stance.”

---

## 9. Open decisions to settle empirically later

These are deliberately unresolved here:

1. Trailing window lengths for percentiles and z-scores (multi-window storage
   vs single default).
2. Whether inflation “stable” uses a dead zone, and how wide.
3. Which yield spread (2s10s vs 3m10y) is primary for conditioning analogs.
4. Whether stock–bond correlation uses ETF proxies or yield-implied bond
   returns.
5. When, if ever, filtered Hamilton probabilities are worth the complexity
   versus Sahm + GDP continuous features.
6. How to present \(r^*\)-based stance given model uncertainty (IMF caution).

Settle each with the integrity tests and sensitivity grids in §5, on holdout
time blocks, before promoting any categorical default into product copy.
