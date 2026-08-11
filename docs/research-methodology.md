# Research Methodology

How ImpactFeedAI decides what counts as evidence. This document is the
reasoning behind the schema and the analog engine — if a product decision
conflicts with something here, this document should win or be revised
deliberately.

The premise: **a historical analog is an argument, not a forecast.** Everything
below exists to make the argument honest.

---

## Event surprise

The market does not react to the number. It reacts to the difference between
the number and what was already priced.

```
surprise = actual − forecast
```

Implemented today and stored as `DataRelease.surpriseMagnitude` when both sides
exist in the metric's canonical unit. The 20 seed forecasts are hand-entered and
explicitly `UNVERIFIED`; no external historical consensus provider is wired yet
(see [data-sources.md](data-sources.md#the-consensus-problem)).

### Why raw surprise is not enough

A raw difference is not comparable across indicators. +0.1 on CPI YoY is a
large surprise; +0.1 on the unemployment rate is enormous; +0.1 thousand on
nonfarm payrolls is noise. Comparing them directly is meaningless, and any
similarity score built on raw surprises will be dominated by whichever
indicator happens to have the largest units.

**Planned normalisation:** express surprise in units of its own historical
dispersion.

```
z = (actual − forecast) / σ(surprise history for this indicator)
```

Open questions to settle empirically rather than by assumption:

- **Rolling or full-sample σ?** Surprise dispersion is itself
  regime-dependent — forecast errors were far larger in 2021–22 than in
  2015–19. A rolling window respects that; a full-sample σ makes different eras
  comparable. Probably both, stored separately.
- **Percentile rank as an alternative.** Distribution-free and robust to
  outliers, at the cost of discarding magnitude information.
- **Revisions.** The `actual` a trader saw at 08:30 is often not the value in
  the database today. Surprise should be computed against the **first print**,
  which requires vintage data (FRED ALFRED).

### Direction is not sign

A higher number is not automatically good news. `CATEGORY_CONFIG.higherIsBetter`
encodes this per category: hot inflation is a negative surprise, a payrolls
beat is positive, a bigger tariff is negative. Surprise direction must always
derive from that flag, never from a raw `actual > forecast` comparison.

Even this is a simplification worth revisiting: in a growth scare, a hot
payrolls print is good news; at the top of a hiking cycle it is bad news
because it implies more tightening. The sign of a surprise can flip with the
regime. That interaction is a Phase 3 problem, but the schema should not
hard-code the assumption that it cannot happen.

---

## Reaction windows

A single "next day return" hides most of what happens. The knee-jerk move, the
fade, and the follow-through are different phenomena and often point in
different directions.

**Target windows:** 5 minutes · 30 minutes · 1 hour · 4 hours · 1 trading day ·
3 trading days · 1 week

**Currently stored:** 1 hour, 1 day, 1 week only, as fixed columns
(`price1h`, `price1d`, `price1w`). Yahoo's ~730-day intraday retention makes 5-
and 30-minute windows impossible for older events without a different price
provider.

Details that decide whether the numbers mean anything:

- **Anchor price.** Calculation version 2 requires a bounded price strictly
  before a sourced `releaseAt`: the latest usable intraday open no more than two
  hours old, otherwise the immediately preceding session close whose provider
  bar is no more than four calendar days old. A first post-release candle is
  never the denominator, so an opening/weekend gap stays in the return.
- **Trading days, not calendar days.** A Friday event's "1 day" is Monday. A
  window crossing a holiday is longer in wall-clock time than one that does
  not.
- **Session boundaries.** For an 08:30 ET release, the 1-hour target coincides
  with the 09:30 cash open. Futures/crypto may have a true intraday endpoint;
  ETF proxies generally express the first-hour repricing as an opening gap.
  Those are different microstructures and should not be over-interpreted as
  equivalent paths.
- **Overlapping events.** CPI at 08:30 and a Fed speaker at 10:00 contaminate
  each other's windows. Contamination should be flagged, not silently averaged
  away.

---

## Reaction metrics

Return alone describes a path badly. Two events with identical +0.5% one-day
returns are not the same if one rose steadily and the other fell 2% first.

| Metric | Definition | Why it matters |
| --- | --- | --- |
| **Return** | `(price_end − price_anchor) / price_anchor` | The headline. Implemented today. |
| **Maximum favourable excursion (MFE)** | Best point reached during the window | How much the move was "there" to capture |
| **Maximum adverse excursion (MAE)** | Worst point reached during the window | The pain before the payoff; the difference between a good idea and a stopped-out one |
| **Realised volatility** | Dispersion of returns within the window | Distinguishes a clean trend from chop |
| **Volume change** | Window volume vs. a baseline | Participation and conviction |
| **Continuation** | Did the direction of the first window persist into later ones? | Separates a real repricing from a knee-jerk |
| **Reversal** | Did a later window retrace the first? | The fade pattern, common around scheduled data |

MFE/MAE need intraday paths, not just endpoint prices — the current pipeline
stores only endpoints. That is a schema and ingestion change, not a
calculation change.

Aggregate metrics that matter as much as the individual ones: **hit rate** (how
often the direction repeated), **median vs. mean** (medians resist the one
outlier that dominates a small sample), and the **full distribution** rather
than either summary alone.

---

## Market regimes

The same event in two regimes is two different events. Regime tags are what
make an analog more than an event-type match.

Candidate classifications, all Phase 2:

**Trend** — bullish / bearish / range. Definable from distance to an N-day
high, moving-average relationships, or higher-high/higher-low structure. The
definition matters less than applying it consistently and documenting it.

**Volatility** — high / normal / low, best expressed as a VIX percentile
against a trailing window rather than an absolute level. "VIX 20" meant
something different in 2017 than in 2022.

**Monetary policy** — easing / neutral / restrictive / on hold. Derivable from
the fed funds path, or better, from the policy rate relative to a neutral-rate
estimate. Both are approximations, and the choice should be recorded with the
data.

**Inflation** — accelerating / decelerating / stable; and level relative to
target.

**Rate environment** — yield level, direction of change, curve shape
(steepening, flattening, inverted).

Two rules for regime tagging:

1. **A regime label is a compression, and compression loses information.**
   Store the underlying continuous features alongside the label so a user can
   disagree with the classification.
2. **Regimes must be computed from data available at the time.** Labelling
   March 2020 as "the start of an easing cycle" using knowledge of what came
   next is look-ahead bias wearing a costume.

---

## Similarity

The core idea of the platform: **similarity is multi-dimensional.** Matching on
one event value produces the naive analysis this product exists to replace.

Conceptually:

```
Similarity = w₁ · MacroSimilarity
           + w₂ · RatesSimilarity
           + w₃ · VolatilitySimilarity
           + w₄ · TrendSimilarity
           + w₅ · StructureSimilarity
           + w₆ · PositioningSimilarity
```

Each family is itself composed of normalised features: macro similarity might
combine surprise z-score, inflation level and inflation direction; rates
similarity might combine 10y level, 3-month change and curve shape.

Design constraints:

- **Normalise before comparing.** Features in different units cannot be
  combined without standardisation, or the largest-unit feature silently
  becomes the whole score.
- **Weights must be tested, not chosen.** Arbitrary weights are the most
  dangerous part of this design because they look principled. Validation: does
  a weighting produce tighter outcome distributions than a same-event-type
  baseline? If it does not, it adds nothing. Beware of tuning weights until
  results look good — that is overfitting with extra steps.
- **Missing features are common.** Positioning data will not exist for older
  events. Options are to renormalise over available families, or to exclude
  events with insufficient coverage. Either way, the coverage must be visible
  in the result.
- **Similarity must be explainable.** A score with no breakdown is unusable in
  research. Every returned analog should show which families matched and which
  did not — the mismatches are often the most informative part.
- **Independence is an assumption, not a fact.** Volatility, trend and rates
  are correlated. Adding correlated families double-counts them. Worth checking
  before adding more.

---

## Avoiding bad research

Every failure mode below has a specific way of appearing in a product like this
one.

**Look-ahead bias.** Using information that did not exist yet. Concretely:
computing surprise against a revised actual instead of the first print;
labelling a regime using later data; using a symbol universe chosen because it
matters *today*. **Defence:** every feature is computed from data timestamped
at or before the event; store vintages.

**Survivorship bias.** Analysing only what still exists. Delisted tickers,
discontinued series, contracts that stopped trading. **Defence:** point-in-time
universes; do not silently drop events with missing instruments.

**Overfitting.** Tuning similarity weights, window lengths, and regime
thresholds until the historical output looks convincing. This is the most
likely way this project produces something that impresses and misleads.
**Defence:** hold out a period; prefer fewer parameters; treat any large
improvement from a small parameter change as a red flag rather than a
discovery.

**Cherry-picking.** Showing the three analogs that agree. **Defence:** the
product shows *all* matches above the similarity threshold, including the ones
that contradict. The counterexamples are a feature.

**Small samples.** Six similar CPI prints is not a distribution. Tight
similarity criteria and adequate sample size are in direct tension — this is
the central trade-off of the entire product, and it cannot be engineered away.
**Defence:** always display n; visually degrade confidence below a threshold;
let users loosen criteria explicitly and see the sample grow.

**Regime change.** The market of 2005 had different participants, different
structure, and no zero-rate memory. A perfect statistical match from twenty
years ago may be worthless. **Defence:** surface recency; consider time-decay
weighting; make the age of each analog prominent.

**Correlation vs. causation.** An event happening before a move does not mean
it caused it. Macro releases cluster — CPI lands in the same week as other
data, into positioning built for other reasons. **Defence:** flag overlapping
events; describe co-occurrence rather than causation; never write "X caused Y"
in generated text.

**Multiple comparisons.** Test enough combinations of event type, regime,
instrument and window and something will look significant at p < 0.05 by
chance. **Defence:** be explicit about how many hypotheses a screen implicitly
tested; treat exploratory findings as hypotheses to test on fresh data, not
conclusions.

**Data quality.** Wrong timestamps, timezone errors, bad splits, stale
consensus. Silent and corrosive. **Defence:** validation in ingestion,
provenance on every row, and spot-checks against a second source.

---

## Output philosophy

What the product shows follows directly from everything above.

**Always show:**

- The **historical examples themselves** — individual, inspectable, dated. A
  user should be able to click through to any single event behind a statistic.
- The **distribution** of outcomes, not just its centre. A histogram of
  next-day returns says more than "average +0.3%".
- The **sample size**, prominently, everywhere. `n = 7` next to a number is not
  a footnote.
- **Context and confidence** — how similar these analogs actually are, how much
  of the feature set was available, how old the matches are.
- **Similarities and differences** side by side. The ways the current setup
  differs from each analog are part of the answer.

**Never show:**

- A single deterministic prediction.
- A directional call or signal.
- A probability presented with more precision than the sample supports.
- A statistic without its sample size.
- Generated prose asserting a fact that no stored row supports.

**When the data is thin, say so.** "Only 4 comparable events, all from
2021–2022" is a more useful answer than a confident chart over four points. A
product that refuses to overstate what it knows is the one worth building.
