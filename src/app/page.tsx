import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowUpRight,
  Bot,
  Check,
  GitCompare,
  Layers,
  LineChart,
  Minus,
  Network,
  Target,
  Zap,
} from "lucide-react";

import { WaitlistForm } from "@/components/landing/WaitlistForm";

export const metadata: Metadata = {
  title: "ImpactFeedAI — Macro market intelligence",
  description:
    "Trace the market reaction behind every major event. Cross-asset breakdowns of tariffs, Fed decisions, CPI prints, and geopolitical shocks.",
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#080C10] font-sans text-zinc-100 antialiased">
      <Navbar />
      <main>
        <Hero />
        <CredibilityStrip />
        <Features />
        <Pricing />
        <WaitlistSection />
      </main>
      <Footer />
    </div>
  );
}

/* ------------------------------------------------------------- */
/*                            Navbar                              */
/* ------------------------------------------------------------- */

function Navbar() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#080C10]/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2">
          <Zap
            className="h-4 w-4 text-[#00FF94]"
            strokeWidth={2.5}
            fill="currentColor"
          />
          <span className="font-mono text-sm font-semibold tracking-tight text-zinc-100">
            ImpactFeedAI
          </span>
        </Link>
        <div className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/feed"
            className="hidden rounded-md px-3 py-1.5 font-mono text-xs font-medium text-zinc-300 transition hover:text-zinc-100 sm:inline-block"
          >
            Event feed
          </Link>
          <Link
            href="#pricing"
            className="hidden rounded-md px-3 py-1.5 font-mono text-xs font-medium text-zinc-300 transition hover:text-zinc-100 sm:inline-block"
          >
            Pricing
          </Link>
          <Link
            href="#waitlist"
            className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 font-mono text-xs font-medium text-zinc-100 transition hover:border-white/20 hover:bg-white/[0.06]"
          >
            Get access
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------- */
/*                              Hero                              */
/* ------------------------------------------------------------- */

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-white/[0.06]">
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-20%] top-[-30%] h-[420px] w-[420px] rounded-full bg-[#00FF94]/[0.06] blur-3xl"
      />
      <div className="relative mx-auto grid max-w-6xl grid-cols-1 gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-12 lg:gap-10 lg:py-24">
        <div className="lg:col-span-6 lg:pr-4">
          <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-400">
            <span className="h-1 w-1 rounded-full bg-[#00FF94]" />
            Macro market intelligence
          </span>
          <h1 className="mt-5 font-mono text-[2.25rem] font-semibold leading-[1.08] tracking-tight text-zinc-50 sm:text-5xl lg:text-[3.5rem]">
            Trace the market reaction behind every major event.
          </h1>
          <p className="mt-5 max-w-xl font-sans text-base leading-relaxed text-zinc-300">
            ImpactFeedAI is a research feed for traders and analysts. Every
            tariff, Fed decision, CPI print, and geopolitical shock — broken
            down into a cross-asset reaction story you can actually use.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="#waitlist"
              className="inline-flex h-10 items-center justify-center rounded-md bg-[#00FF94] px-5 font-mono text-sm font-semibold text-[#080C10] transition hover:bg-[#00FF94]/90 focus:outline-none focus:ring-2 focus:ring-[#00FF94]/40"
            >
              Request beta access
            </Link>
            <Link
              href="/feed"
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-transparent px-5 font-mono text-sm font-medium text-zinc-100 transition hover:border-white/20 hover:bg-white/[0.04]"
            >
              View the live feed
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-400">
            Free during beta · No credit card · Invite-only
          </p>
        </div>

        <div className="lg:col-span-6">
          <HeroPreviewStack />
        </div>
      </div>
    </section>
  );
}

interface PreviewAsset {
  ticker: string;
  klass: string;
  change: number;
  weight: number;
}

const PRIMARY_ASSETS: PreviewAsset[] = [
  { ticker: "SPY", klass: "INDEX", change: -4.84, weight: 0.78 },
  { ticker: "NQ", klass: "INDEX", change: -5.97, weight: 1.0 },
  { ticker: "GC", klass: "COMMODITY", change: -2.49, weight: 0.42 },
  { ticker: "DXY", klass: "FOREX", change: -1.67, weight: 0.28 },
  { ticker: "BTC", klass: "CRYPTO", change: -3.14, weight: 0.53 },
];

const BACKGROUND_ASSETS: PreviewAsset[] = [
  { ticker: "SPY", klass: "INDEX", change: 0.34, weight: 0.18 },
  { ticker: "TLT", klass: "BOND", change: 1.12, weight: 0.62 },
  { ticker: "DXY", klass: "FOREX", change: -0.27, weight: 0.14 },
  { ticker: "GC", klass: "COMMODITY", change: 0.81, weight: 0.45 },
];

function HeroPreviewStack() {
  return (
    <div className="relative">
      {/* Offset background card — archive depth */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden translate-x-3 translate-y-3 scale-[0.96] opacity-30 sm:block"
      >
        <BackgroundPreviewCard />
      </div>

      {/* Foreground card */}
      <div className="relative">
        <HeroPreview />
      </div>
    </div>
  );
}

function HeroPreview() {
  return (
    <div>
      <div className="flex items-center justify-between px-1 pb-2">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#00FF94]" />
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-400">
            Event · IFA-2025-04-03
          </span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-400">
          Preview
        </span>
      </div>

      <article className="rounded-lg border border-white/[0.08] bg-[#0B1116] shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)]">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
          <span
            className="rounded-md px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em]"
            style={{
              backgroundColor: "rgba(255,107,53,0.12)",
              color: "#FF6B35",
              border: "1px solid rgba(255,107,53,0.25)",
            }}
          >
            Tariff
          </span>
          <time className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-400">
            Apr 03 · 2025
          </time>
        </div>

        <div className="px-5 pt-4 pb-3">
          <h3 className="font-mono text-[15px] font-semibold leading-snug text-zinc-50">
            Trump unveils &lsquo;Liberation Day&rsquo; tariffs — worst equity
            session since COVID
          </h3>
          <p className="mt-1.5 font-sans text-[13px] leading-relaxed text-zinc-300">
            10% baseline import duty, reciprocal rates up to 49%. Cyclicals
            led the decline; dollar weakened on growth concerns.
          </p>
        </div>

        <div className="border-t border-white/[0.04] px-5 py-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-400">
              Cross-asset reaction
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-400">
              T+1 close
            </span>
          </div>
          <ul className="space-y-1.5">
            {PRIMARY_ASSETS.map((a) => (
              <PreviewRow key={a.ticker} asset={a} />
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-3">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-400">
              Impact score
            </span>
            <span className="font-mono text-sm font-semibold text-zinc-100">
              8.2
            </span>
            <span className="font-mono text-[11px] text-zinc-400">/ 10</span>
          </div>
          <span className="inline-flex items-center gap-1 font-mono text-xs font-medium text-zinc-300">
            Open story
            <ArrowUpRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </article>
    </div>
  );
}

function BackgroundPreviewCard() {
  return (
    <div>
      <div className="flex items-center justify-between px-1 pb-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-400">
          Event · IFA-2025-05-06
        </span>
      </div>

      <article className="rounded-lg border border-white/[0.08] bg-[#0B1116]">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
          <span
            className="rounded-md px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em]"
            style={{
              backgroundColor: "rgba(167,139,250,0.14)",
              color: "#A78BFA",
              border: "1px solid rgba(167,139,250,0.28)",
            }}
          >
            Fed
          </span>
          <time className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-400">
            May 06 · 2025
          </time>
        </div>

        <div className="px-5 pt-4 pb-3">
          <h3 className="font-mono text-[15px] font-semibold leading-snug text-zinc-50">
            Fed holds, Powell signals extended pause through Q3
          </h3>
          <p className="mt-1.5 font-sans text-[13px] leading-relaxed text-zinc-300">
            FOMC kept rates 4.25–4.50%. Dot plot unchanged; dovish risk
            language dropped — long end of curve rallied on growth concern.
          </p>
        </div>

        <div className="border-t border-white/[0.04] px-5 py-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-400">
              Cross-asset reaction
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-400">
              T+1 close
            </span>
          </div>
          <ul className="space-y-1.5">
            {BACKGROUND_ASSETS.map((a) => (
              <PreviewRow key={a.ticker} asset={a} />
            ))}
          </ul>
        </div>
      </article>
    </div>
  );
}

function PreviewRow({ asset }: { asset: PreviewAsset }) {
  const isDown = asset.change < 0;
  const isFlat = asset.change === 0;
  const colorClass = isFlat
    ? "text-zinc-300"
    : isDown
      ? "text-red-400"
      : "text-[#00FF94]";
  const barColor = isFlat
    ? "bg-zinc-500"
    : isDown
      ? "bg-red-400/70"
      : "bg-[#00FF94]/70";
  const sign = asset.change > 0 ? "+" : "";

  return (
    <li className="flex items-center gap-3 text-[13px]">
      <span className="w-10 shrink-0 font-mono font-semibold tracking-tight text-zinc-100">
        {asset.ticker}
      </span>
      <span className="w-20 shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400">
        {asset.klass}
      </span>
      <span className="relative flex-1">
        <span className="block h-[3px] w-full rounded-full bg-white/[0.04]" />
        <span
          className={`absolute left-0 top-0 block h-[3px] rounded-full ${barColor}`}
          style={{ width: `${Math.round(asset.weight * 100)}%` }}
        />
      </span>
      <span
        className={`w-16 shrink-0 text-right font-mono text-[12px] font-semibold tabular-nums ${colorClass}`}
      >
        {sign}
        {asset.change.toFixed(2)}%
      </span>
    </li>
  );
}

/* ------------------------------------------------------------- */
/*                       Credibility strip                        */
/* ------------------------------------------------------------- */

interface Metric {
  value: string;
  label: string;
}

const METRICS: Metric[] = [
  { value: "142", label: "Events catalogued" },
  { value: "12", label: "Asset classes" },
  { value: "5", label: "Event categories" },
  { value: "2019", label: "Coverage since" },
];

function CredibilityStrip() {
  return (
    <section className="border-b border-white/[0.06] bg-white/[0.015]">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <ul className="grid grid-cols-2 divide-x divide-white/[0.06] md:grid-cols-4">
          {METRICS.map((m, i) => (
            <li
              key={m.label}
              className={`flex flex-col gap-1 px-5 py-6 md:px-8 ${
                i === 0 ? "md:pl-0" : ""
              }`}
            >
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-400">
                {m.label}
              </span>
              <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight text-zinc-50">
                {m.value}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- */
/*                            Features                            */
/* ------------------------------------------------------------- */

interface Feature {
  index: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}

const FEATURES: Feature[] = [
  {
    index: "01",
    icon: <Target className="h-4 w-4" />,
    title: "Event breakdowns",
    description:
      "Every major release decomposed into expectation, actual print, surprise direction, and the price reaction across the full asset stack.",
  },
  {
    index: "02",
    icon: <Network className="h-4 w-4" />,
    title: "Cross-asset reaction map",
    description:
      "Stop reading equity-only takes. See how a shock travels through stocks, rates, FX, gold, oil, and crypto — ranked by magnitude.",
  },
  {
    index: "03",
    icon: <Layers className="h-4 w-4" />,
    title: "Macro catalyst archive",
    description:
      "Searchable archive of every catalyst we've covered. Filter by category, sort by impact, and find the historical comp for what's happening today.",
  },
  {
    index: "04",
    icon: <Bot className="h-4 w-4" />,
    title: "AI event explainer",
    description:
      "Plain-English AI explanation of why each asset moved the way it did. Ask follow-up questions in context, grounded in the underlying data.",
  },
  {
    index: "05",
    icon: <GitCompare className="h-4 w-4" />,
    title: "Historical pattern library",
    description:
      "Browse all events by category — tariff announcements, FOMC decisions, hot inflation prints. See average asset reactions across all historical instances, searchable and filterable.",
  },
  {
    index: "06",
    icon: <LineChart className="h-4 w-4" />,
    title: "Paper trade mode",
    description:
      "Before scheduled releases, predict which way assets move. After the release, see exactly how you would have done. Builds real trading intuition, not just knowledge.",
  },
];

function Features() {
  return (
    <section className="border-b border-white/[0.06]">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
        <div className="mb-12 max-w-2xl">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-400">
            Capabilities
          </span>
          <h2 className="mt-3 font-mono text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
            A research workflow built around catalysts, not headlines.
          </h2>
          <p className="mt-3 font-sans text-[15px] leading-relaxed text-zinc-300">
            Built for traders, macro analysts, and researchers who need to
            understand reaction — not just price.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.06] sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <FeatureCard key={f.index} feature={f} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ feature }: { feature: Feature }) {
  return (
    <article className="flex flex-col bg-[#0A0F14] p-6 sm:p-7">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.02] text-[#00FF94]">
          {feature.icon}
        </span>
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
          {feature.index}
        </span>
        <span className="h-px flex-1 bg-white/[0.06]" />
      </div>
      <h3 className="mt-5 font-mono text-base font-semibold tracking-tight text-zinc-50">
        {feature.title}
      </h3>
      <p className="mt-2 font-sans text-[13px] leading-relaxed text-zinc-300">
        {feature.description}
      </p>
    </article>
  );
}

/* ------------------------------------------------------------- */
/*                            Pricing                             */
/* ------------------------------------------------------------- */

type CellValue = true | false | string;

interface TierColumn {
  key: "free" | "pro" | "premium";
  name: string;
  price: string;
  cadence: string;
  badge?: string;
  accent: "muted" | "primary" | "secondary";
  ctaLabel: string;
}

const TIER_COLUMNS: TierColumn[] = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    cadence: "forever",
    accent: "muted",
    ctaLabel: "Start free",
  },
  {
    key: "pro",
    name: "Pro",
    price: "$19",
    cadence: "/ month",
    accent: "primary",
    badge: "Most popular",
    ctaLabel: "Join Pro waitlist",
  },
  {
    key: "premium",
    name: "Premium",
    price: "$49",
    cadence: "/ month",
    accent: "secondary",
    ctaLabel: "Join Premium waitlist",
  },
];

interface FeatureRow {
  label: string;
  free: CellValue;
  pro: CellValue;
  premium: CellValue;
}

const FEATURE_ROWS: FeatureRow[] = [
  {
    label: "Event history",
    free: "Last 30 days",
    pro: "Full history",
    premium: "Full history",
  },
  {
    label: "Assets per event",
    free: "3 assets",
    pro: "All assets",
    premium: "All assets",
  },
  { label: "AI event explainer", free: false, pro: true, premium: true },
  {
    label: "Paper trades",
    free: "5 / month",
    pro: "Unlimited",
    premium: "Unlimited",
  },
  { label: "Similar event finder", free: false, pro: true, premium: true },
  { label: "Pre-event risk scores", free: false, pro: true, premium: true },
  { label: "Live push alerts", free: false, pro: true, premium: true },
  { label: "AI chat (ask anything)", free: false, pro: false, premium: true },
  { label: "Regime change alerts", free: false, pro: false, premium: true },
  { label: "Sentiment data layer", free: false, pro: false, premium: true },
  {
    label: "Personalised learning path",
    free: false,
    pro: false,
    premium: true,
  },
  { label: "API access", free: false, pro: false, premium: true },
  { label: "Early feature access", free: false, pro: false, premium: true },
];

function tierNameClass(accent: TierColumn["accent"]): string {
  if (accent === "primary") return "text-[#00FF94]";
  if (accent === "secondary") return "text-[#FF6B35]";
  return "text-zinc-300";
}

function tierCellTintClass(accent: TierColumn["accent"]): string {
  // Subtle vertical tint behind the Pro column for emphasis
  if (accent === "primary") return "bg-[#00FF94]/[0.025]";
  return "";
}

function tierCtaClass(accent: TierColumn["accent"]): string {
  if (accent === "primary")
    return "bg-[#00FF94] text-[#080C10] hover:bg-[#00FF94]/90";
  if (accent === "secondary")
    return "border border-[#FF6B35]/40 bg-[#FF6B35]/[0.06] text-[#FF6B35] hover:bg-[#FF6B35]/10";
  return "border border-white/15 bg-white/[0.03] text-zinc-100 hover:border-white/25 hover:bg-white/[0.06]";
}

function renderCell(value: CellValue) {
  if (value === true) {
    return (
      <span className="inline-flex items-center justify-center">
        <Check
          className="h-4 w-4 text-[#00FF94]"
          strokeWidth={3}
          aria-label="Included"
        />
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="inline-flex items-center justify-center">
        <Minus
          className="h-4 w-4 text-zinc-500"
          strokeWidth={2.5}
          aria-label="Not included"
        />
      </span>
    );
  }
  return (
    <span className="font-mono text-[13px] text-zinc-200">{value}</span>
  );
}

function Pricing() {
  return (
    <section
      id="pricing"
      className="scroll-mt-14 border-b border-white/[0.06] bg-white/[0.01]"
    >
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
        <div className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-400">
              Pricing · Beta rates
            </span>
            <h2 className="mt-3 font-mono text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
              Honest pricing. Lock the beta rate before launch.
            </h2>
          </div>
          <p className="max-w-sm font-sans text-sm text-zinc-300">
            Beta members keep their rate for life. No long-term contracts, no
            data resale.
          </p>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-[#0A0F14]">
          {/* Mobile: horizontal scroll wrapper */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left">
              <colgroup>
                <col className="w-[40%]" />
                <col className="w-[20%]" />
                <col className="w-[20%]" />
                <col className="w-[20%]" />
              </colgroup>

              <thead>
                <tr>
                  <th className="border-b border-zinc-800 px-5 pb-4 pt-7 align-bottom">
                    <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-400">
                      Compare plans
                    </span>
                  </th>
                  {TIER_COLUMNS.map((tier) => (
                    <th
                      key={tier.key}
                      className={`relative border-b border-zinc-800 px-4 pb-4 pt-7 text-center align-bottom ${tierCellTintClass(tier.accent)}`}
                    >
                      {tier.badge && (
                        <span className="absolute left-1/2 top-2 -translate-x-1/2 rounded-full border border-[#00FF94]/30 bg-[#080C10] px-2.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-[#00FF94]">
                          {tier.badge}
                        </span>
                      )}
                      <div
                        className={`font-mono text-xs font-bold uppercase tracking-[0.2em] ${tierNameClass(tier.accent)}`}
                      >
                        {tier.name}
                      </div>
                    </th>
                  ))}
                </tr>
                <tr>
                  <th className="border-b border-zinc-800 px-5 pb-5 pt-1 text-left align-top">
                    <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-400">
                      Price
                    </span>
                  </th>
                  {TIER_COLUMNS.map((tier) => (
                    <th
                      key={tier.key}
                      className={`border-b border-zinc-800 px-4 pb-5 pt-1 text-center align-top ${tierCellTintClass(tier.accent)}`}
                    >
                      <span className="font-mono text-xl font-semibold text-zinc-50">
                        {tier.price}
                      </span>
                      <span className="ml-1 font-mono text-[11px] text-zinc-400">
                        {tier.cadence}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {FEATURE_ROWS.map((row, i) => {
                  const stripe =
                    i % 2 === 1 ? "bg-zinc-900/40" : "bg-transparent";
                  return (
                    <tr key={row.label}>
                      <td
                        className={`border-b border-zinc-800/60 px-5 py-3 align-middle ${stripe}`}
                      >
                        <span className="font-mono text-[13px] text-zinc-300">
                          {row.label}
                        </span>
                      </td>
                      {TIER_COLUMNS.map((tier) => (
                        <td
                          key={tier.key}
                          className={`border-b border-zinc-800/60 px-4 py-3 text-center align-middle ${stripe} ${tierCellTintClass(tier.accent)}`}
                        >
                          {renderCell(row[tier.key])}
                        </td>
                      ))}
                    </tr>
                  );
                })}

                <tr>
                  <td className="px-5 py-5"></td>
                  {TIER_COLUMNS.map((tier) => (
                    <td
                      key={tier.key}
                      className={`px-3 py-5 text-center align-top ${tierCellTintClass(tier.accent)}`}
                    >
                      <Link
                        href="#waitlist"
                        className={`inline-flex h-9 w-full items-center justify-center rounded-md px-3 font-mono text-[12px] font-semibold transition ${tierCtaClass(tier.accent)}`}
                      >
                        {tier.ctaLabel}
                      </Link>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- */
/*                            Waitlist                            */
/* ------------------------------------------------------------- */

function WaitlistSection() {
  return (
    <section
      id="waitlist"
      className="scroll-mt-14 border-b border-white/[0.06]"
    >
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-400">
            Beta access
          </span>
          <h2 className="mt-3 font-mono text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
            Be first when we launch.
          </h2>
          <p className="mt-3 max-w-md font-sans text-[15px] leading-relaxed text-zinc-300">
            We&rsquo;re onboarding traders, analysts, and macro researchers in
            small cohorts. Drop your email and we&rsquo;ll send an invite when
            your slot is up.
          </p>
        </div>
        <div className="lg:col-span-7">
          <div className="rounded-lg border border-white/[0.06] bg-[#0A0F14] p-6 sm:p-8">
            <WaitlistForm />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- */
/*                             Footer                             */
/* ------------------------------------------------------------- */

function Footer() {
  return (
    <footer>
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Zap
              className="h-3.5 w-3.5 text-[#00FF94]"
              strokeWidth={2.5}
              fill="currentColor"
            />
            <span className="font-mono text-xs font-semibold tracking-tight text-zinc-200">
              ImpactFeedAI
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">
              · Macro intelligence
            </span>
          </div>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-xs text-zinc-300">
            <Link href="/feed" className="transition hover:text-zinc-100">
              Event feed
            </Link>
            <Link href="#pricing" className="transition hover:text-zinc-100">
              Pricing
            </Link>
            <Link href="#waitlist" className="transition hover:text-zinc-100">
              Beta access
            </Link>
          </nav>
        </div>
        <div className="mt-8 flex flex-col items-start gap-2 border-t border-white/[0.05] pt-6 font-mono text-[11px] text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
          <span>© 2025 ImpactFeedAI · All rights reserved</span>
          <span className="uppercase tracking-[0.2em]">
            Not investment advice
          </span>
        </div>
      </div>
    </footer>
  );
}