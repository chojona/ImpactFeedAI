/**
 * PLACEHOLDER DATA — hand-written "why did this asset move" copy, keyed by
 * event id then asset symbol. This is the text an AI explainer layer would
 * eventually generate from stored event + reaction rows (docs/roadmap.md,
 * Phase 4). Written by hand today; nothing generates it.
 */
export const assetReasoning: Record<string, Record<string, string>> = {
  "trump-liberation-day-tariffs-2025": {
    SPY: "Equities suffered the worst session since the 2020 COVID crash on growth-damage fears. Cyclicals — industrials, autos, retailers — led declines as investors priced in higher input costs and weaker global demand.",
    NQ: "Tech and semiconductors took the heaviest hit due to extensive China supply-chain exposure. Names dependent on EU and Asian revenue saw the sharpest drawdowns.",
    GC: "Gold initially spiked on safe-haven demand but reversed as forced liquidation cascaded. When traders need cash to meet margin calls, even haven assets get sold — the 'sell what you can' dynamic.",
    DXY: "The dollar weakened despite the risk-off tone — counterintuitive but logical. Tariffs raise US growth risk and pull forward Fed cuts, and that channel dominated typical haven-flow into the buck.",
    BTC: "Bitcoin fell with broad risk assets. The 'digital gold' narrative didn't hold — crypto traded as a high-beta tech proxy during the de-grossing.",
  },
  "trump-90-day-pause-april-2025": {
    SPY: "One of the largest single-day equity rallies on record as the worst tariff scenario was suddenly off the table for 90 days. Short-covering amplified the move.",
    NQ: "Tech ripped hardest on relief — the names crushed in the prior week's selloff led the rebound, with semis and megacaps both up double digits intraday.",
    IWM: "Small caps outperformed as rate-cut expectations re-firmed and domestic-focused names benefited from reduced tariff uncertainty around input costs.",
    GC: "Gold fell sharply as the safe-haven trade unwound; flows rotated decisively into risk assets across the complex.",
    BTC: "Bitcoin rallied with risk-on tone — crypto continues to track equity beta during macro shocks rather than acting as a haven.",
  },
  "china-counter-tariffs-april-2025": {
    SPY: "Equities sold on confirmation that tariffs weren't ending — China escalation showed Trump wasn't bluffing and undermined hopes for quick negotiations.",
    NQ: "Tech bore the brunt as supply-chain exposure to China cuts deepest in semis and consumer electronics; rare-earth restriction risk amplified the move.",
    GC: "Gold rallied on safe-haven demand as the trade war became a sustained reality rather than a negotiating tactic.",
    DXY: "Dollar weakened on growth fears and pricing of additional Fed cuts to offset tariff drag.",
    BTC: "Bitcoin sold with risk assets — still trading like a high-beta tech proxy, not a sovereign-risk hedge.",
  },
  "cpi-january-2025-hot": {
    SPY: "Stocks fell modestly as a hotter-than-expected CPI print pushed back rate-cut timing. Rate-sensitive sectors — utilities, REITs, small caps — underperformed.",
    TLT: "Long-duration Treasuries sold off the hardest. The 10Y yield jumped roughly 10bps as traders unwound rate-cut bets, and TLT bore the brunt of duration repricing.",
    GC: "Gold drifted lower despite the inflation print, breaking its typical inflation-hedge correlation. Real yields rose sharply, raising the opportunity cost of holding non-yielding gold.",
    NQ: "Tech-heavy Nasdaq fell more than the S&P. Growth names get hit hardest when rate-cut expectations get pushed out — the discount rate on long-duration cash flows rises.",
  },
  "cpi-april-2025-cool": {
    SPY: "Equities rose modestly on confirmation that disinflation was still intact, supporting the rate-cut narrative the Fed had hinted at in March.",
    TLT: "Long bonds rallied as cooler inflation pulled forward expected Fed easing and lowered terminal-rate expectations.",
    GC: "Gold gained on softer real yields — non-yielding assets benefit when inflation undershoots and rates trend lower.",
    NQ: "Tech outperformed as growth and long-duration names benefit most when rate-cut expectations firm up.",
  },
  "pce-december-2024-hot": {
    SPY: "Stocks fell modestly on the third consecutive PCE reacceleration, which complicated the Fed's path to the next cut.",
    TLT: "Long bonds sold off as traders pushed back the next-cut timing; duration is most sensitive to terminal-rate repricing.",
    GC: "Gold drifted lower as real yields rose — even modest hot inflation prints can hurt gold when they raise rates faster than inflation.",
    NQ: "Tech-heavy Nasdaq fell more than the S&P; growth names get hit hardest when discount rates rise.",
  },
  "fomc-march-2025-hold": {
    SPY: "Equities rallied on the dovish hold. The unchanged dot plot — still two cuts in 2025 — reassured markets that tariff inflation wouldn't derail the easing path.",
    BTC: "Bitcoin surged nearly 5%. Crypto is highly sensitive to liquidity expectations, and the slowing of QT — Treasury runoff cap cut from $25B to $5B — is a quiet but real liquidity tailwind.",
    IWM: "Small caps led the rally. Russell 2000 names carry more floating-rate debt than large caps, so any signal of easing is disproportionately positive for their cost of capital.",
    GC: "Gold edged higher on dovish guidance. Lower expected real rates and a weaker dollar trajectory are constructive for non-yielding assets.",
  },
  "fomc-may-2025-pause": {
    SPY: "Equities sold on the unexpectedly hawkish tone — markets had positioned for a softer Powell after recent cool data and were caught offside.",
    BTC: "Crypto sold with risk-off tone; sensitive to liquidity expectations, which Powell's 'no hurry' stance pushed back.",
    IWM: "Small caps fell hardest — Russell 2000 is the most rate-sensitive index given heavy floating-rate debt loads.",
    DXY: "Dollar rallied on the hawkish guidance as US-rate-differential expectations widened versus G10 peers.",
  },
  "israel-iran-strike-june-2025": {
    CL: "WTI crude jumped 7% to a five-month high on disruption risk to Strait of Hormuz transit (~18M bpd). Even a brief closure would meaningfully tighten global supply.",
    GC: "Gold rallied on classic safe-haven demand and retest of all-time highs. Geopolitical shocks are gold's clearest bull case.",
    SPY: "Equities sold worldwide as oil shocks hit growth and inflation simultaneously — a rare double-negative for stocks.",
    DXY: "Dollar caught a haven bid against most G10, modest move given the risk-off backdrop.",
    BTC: "Bitcoin sold off — still tracking equity beta during geopolitical shocks rather than acting as a sovereign hedge.",
  },
  "scotus-tariffs-feb-2026": {
    SPY: "Equities ripped on the surprise sweeping ruling — markets had priced ~50/50 odds, so the 6-3 strikedown was a fat-tailed positive surprise.",
    NQ: "Tech and consumer-discretionary led on relief from input-cost pressure on import-heavy supply chains.",
    IWM: "Small caps led the rally as domestic-focused but import-reliant names — apparel, retail — finally got tariff drag removed.",
    DXY: "Dollar strengthened on growth optimism — rate-differential repricing and stronger US growth narrative both dollar-positive.",
    GC: "Gold fell on risk-on flows as the haven trade unwound across the asset complex.",
    BTC: "Bitcoin rallied with risk assets — same high-beta-tech behavior continues during macro positives.",
  },
  "nvda-q1-fy26-beat": {
    NVDA: "Beat on top line and guidance despite the H20 export-restriction headwind, confirming the Blackwell ramp is ahead of expectations and AI capex is sticky.",
    SOXX: "Semis broadly rallied as NVDA results de-risked the AI-capex thesis for the second half of 2025.",
    QQQ: "Nasdaq lifted as NVDA represents a major weight and AI capex remains the dominant tech narrative.",
    SPY: "Broader market gained modestly — NVDA results lift the whole tech complex via index weighting.",
  },
  "tsla-q1-2025-miss": {
    TSLA: "Sold off after-hours on the EPS miss, lowest auto gross margin since 2020, and ongoing demand questions; price cuts aren't translating to volume.",
    QQQ: "Nasdaq fell as Tesla is a top-10 holding by weight; the miss bled into broader tech sentiment around megacap concentration risk.",
    SPY: "Modest decline on the disappointing print combined with broader earnings-season concerns.",
    IWM: "Small caps fell more than large caps as risk-off tone amid tariff uncertainty compounded TSLA-specific weakness.",
  },
};
