# Vision

## Why ImpactFeedAI exists

Every trader who follows macro eventually asks the same question in the ten
minutes before a release: *what usually happens after a print like this?*

Answering it properly is tedious. You need the release history, consensus
estimates, the price reaction across several instruments, and — the part almost
nobody does — the surrounding conditions. Was the Fed hiking or cutting? Were
yields rising? Was volatility elevated? Was the index at highs or recovering
from a drawdown? Assembling that for one event takes an afternoon. Assembling
it for forty comparable events takes a week, so it never gets done, and the
trader falls back on a vague memory of "CPI hot, stocks down" that may be
wrong.

ImpactFeedAI exists to make that research cheap enough that it actually
happens.

## The problem it solves

Existing tools are each good at one slice and blind to the rest:

- **Economic calendars** publish the number and the consensus, then stop. No
  reaction data, no context.
- **Charting platforms** show the price move but know nothing about the macro
  release that caused it.
- **Data terminals** have everything and cost more per year than most retail
  traders make from the strategy.
- **Backtesters** are built for mechanical rules, not for "show me the six
  times this environment happened before".

The gap is a research surface that joins **the event**, **the reaction**, and
**the conditions the event landed in** — and lets you search across all three
at once.

That last part is the whole thesis. A CPI beat of +0.2pp is not one thing. It
is one thing when the Fed is on hold with the market pricing cuts and equities
at highs, and a different thing mid-hiking-cycle with credit spreads widening.
Treating these as the same data point is why naive event studies produce
averages that describe nothing. A historical analog becomes meaningful when
several independent factors align — macro regime, inflation trend, Fed policy,
yields, volatility, trend, structure, positioning.

## Who it's for

**Primary:** the self-directed trader who trades or hedges around macro events —
index futures, options, or spot — and who wants evidence rather than a hot take.
Comfortable with distributions and sample sizes. Wants to check their instinct
against the record before risking capital.

**Secondary:** analysts and researchers who need a fast way to build the
historical exhibit for a thesis, and traders learning macro who want to see the
transmission mechanism — release → rates → equities → dollar → commodities — laid
out concretely instead of described abstractly.

**Explicitly not for:** anyone looking for signals to follow without
understanding them. If a user could get value from the product without thinking,
the product is designed wrong.

## What the finished platform should feel like

Fast, dense, and honest.

- **Fast.** You have a question during a live event. You get to the evidence in
  seconds, not after configuring a query builder. Bloomberg-terminal
  information density with modern consumer-app responsiveness.
- **Dense.** Numbers over decoration. A screen should carry a lot of
  information and reward a second look, without becoming a wall of text.
- **Honest.** Every number carries its sample size and its caveats. When the
  data is thin, the interface says so loudly rather than rendering a confident
  chart over six observations. Differences between the current setup and each
  historical analog are shown as prominently as the similarities.
- **Legible.** A user should always be able to see *why* an analog was
  returned — which features matched and how strongly. No unexplained
  similarity score.

The feeling to aim for: a well-organised research desk that has already done
the tedious part, not an oracle.

## Long-term vision

The end state is a **cross-domain market memory**.

1. **Recorded history.** Every meaningful macro release and market event, stored
   with what was expected, what printed, and how a broad set of instruments
   responded across multiple horizons.
2. **Contextualised history.** Each event annotated with the environment it
   landed in: rate regime, inflation trend, volatility, equity trend, market
   structure, and eventually positioning and options data.
3. **Searchable by similarity.** Describe a situation — today's, or a
   hypothetical — and get the historical periods that most resemble it, scored
   across feature families, with the outcome distribution that followed.
4. **Explained in language.** Ask a question in plain English, get an answer
   grounded in retrieved records, with the underlying rows one click away. The
   language model is an interface to the data, never a substitute for it.

## Guiding principles

**ImpactFeedAI should augment trader judgment rather than replace it.**

The platform's job is to find evidence supporting or contradicting a hypothesis
the user brought. It is a research assistant, not a decision-maker. Every
design decision defers to this: show the distribution rather than the mean,
show the sample rather than the summary, show the counterexamples.

**The database is the source of truth; the AI layer is an interface to it.**

A language model may retrieve, filter, summarise, compare, and explain stored
records. It may not supply a historical fact from memory. If a number appears
in the product, a row in Postgres backs it and the user can see that row.

**Uncertainty is a feature, not a defect to hide.**

Sample sizes, conflicting precedents, and regime changes that break the analogy
are part of the answer. A product that surfaces them is more useful than one
that resolves them artificially.

## Out of scope

These are deliberate non-goals, not "later" items:

- **Trade signals.** No buy/sell recommendations, no entries, no targets.
- **Order execution.** No broker integration, no automated trading, no
  portfolio management.
- **Price prediction.** No model that outputs "SPX will be +0.4% tomorrow".
  Distributions of historical outcomes, always.
- **A general news reader.** The product is about events with measurable market
  reactions, not commentary or sentiment aggregation.
- **Financial advice.** Research and education only, for everyone.
- **A social platform.** No feeds of other users' calls, no leaderboards.

Anything that would let a user act on the platform's output without
understanding the reasoning behind it belongs on this list.
