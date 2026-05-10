import Link from "next/link";
import type { Metadata } from "next";
import { Clock, HelpCircle, Layers, Zap } from "lucide-react";

import {
  MockPatternVisual,
  MockReplayVisual,
  MockSurpriseVisual,
} from "@/components/landing/FeatureMocks";
import { WaitlistForm } from "@/components/landing/WaitlistForm";

export const metadata: Metadata = {
  title: "ImpactFeedAI — Finally understand why markets move",
  description:
    "Every major news event, broken down into a visual cross-asset reaction story. Trade with conviction, not confusion.",
};

export default function LandingPage() {
  return (
    <div className="bg-[#080C10] text-zinc-100">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="grid-drift absolute inset-0" />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#080C10] to-transparent"
        />
        <div className="relative mx-auto max-w-5xl px-6 py-20 sm:py-28 lg:py-36">
          <Link href="/" className="inline-flex items-center gap-2">
            <Zap
              className="h-5 w-5 text-[#00FF94]"
              strokeWidth={2.5}
              fill="currentColor"
            />
            <span className="text-base font-semibold tracking-tight">
              ImpactFeedAI
            </span>
          </Link>
          <h1 className="mt-12 max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight text-zinc-50 sm:text-5xl lg:text-7xl">
            Finally understand why{" "}
            <span className="text-[#00FF94]">markets move</span>.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-zinc-400 sm:text-lg lg:text-xl">
            ImpactFeedAI turns every major news event into a visual,
            cross-asset market story — so you can trade with conviction, not
            confusion.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:gap-4">
            <Link
              href="#waitlist"
              className="inline-flex items-center justify-center rounded-md bg-[#00FF94] px-6 py-3 text-sm font-semibold text-[#080C10] transition hover:bg-[#00FF94]/90 focus:outline-none focus:ring-2 focus:ring-[#00FF94]/40"
            >
              Join Waitlist
            </Link>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-md border border-white/10 bg-white/[0.02] px-6 py-3 text-sm font-semibold text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.04]"
            >
              See it in action →
            </Link>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="mx-auto max-w-5xl px-6 py-20 sm:py-24">
        <h2 className="mb-10 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          The problem
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <ProblemCard
            icon={<HelpCircle className="h-5 w-5" />}
            text="You see the headline. You see the chart. You don't know why."
          />
          <ProblemCard
            icon={<Layers className="h-5 w-5" />}
            text="Bloomberg is too dense. YouTube is too slow. Twitter is too noisy."
          />
          <ProblemCard
            icon={<Clock className="h-5 w-5" />}
            text="By the time you understand what happened, the trade is gone."
          />
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-6 py-20 sm:py-24">
        <h2 className="mb-12 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          What you get
        </h2>
        <div className="space-y-16 sm:space-y-24">
          <FeatureRow
            title="Cross-asset replay"
            description="Watch Gold, SPY, BTC, and DXY react simultaneously to the exact moment news dropped. See the full story play out, not just the aftermath."
            visual={<MockReplayVisual />}
            reverse={false}
          />
          <FeatureRow
            title="Expectation vs Reality"
            description="The market doesn't react to the number — it reacts to the surprise. We show you both, color-coded by which side of the surprise you're on."
            visual={<MockSurpriseVisual />}
            reverse
          />
          <FeatureRow
            title="Pattern Library"
            description="Every time tariffs were announced, here's the average reaction across 12 events. Build intuition fast — see which assets move the most and which react most consistently."
            visual={<MockPatternVisual />}
            reverse={false}
          />
        </div>
      </section>

      {/* Waitlist */}
      <section
        id="waitlist"
        className="border-y border-white/5 bg-white/[0.01] scroll-mt-12"
      >
        <div className="mx-auto max-w-2xl px-6 py-20 text-center sm:py-24">
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
            Get early access
          </h2>
          <p className="mt-3 text-base leading-relaxed text-zinc-400 sm:text-lg">
            Be first to know when we launch. Early access pricing for the
            first 500 traders.
          </p>
          <div className="mt-8">
            <WaitlistForm />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Zap
                className="h-4 w-4 text-[#00FF94]"
                strokeWidth={2.5}
                fill="currentColor"
              />
              <span className="text-sm font-semibold tracking-tight">
                ImpactFeedAI
              </span>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Built by a trader, for traders.
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <Link
              href="/"
              className="text-zinc-400 transition hover:text-zinc-100"
            >
              Try the App
            </Link>
            <Link
              href="/patterns"
              className="text-zinc-400 transition hover:text-zinc-100"
            >
              Pattern Library
            </Link>
            <a
              href="#"
              className="text-zinc-400 transition hover:text-zinc-100"
            >
              Twitter / X
            </a>
          </nav>
        </div>
        <div className="mt-8 border-t border-white/5 pt-6 text-xs text-zinc-600">
          © {new Date().getFullYear()} ImpactFeedAI. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

function ProblemCard({
  icon,
  text,
}: {
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-6">
      <div className="text-[#00FF94]">{icon}</div>
      <p className="mt-4 text-base leading-relaxed text-zinc-300">{text}</p>
    </div>
  );
}

function FeatureRow({
  title,
  description,
  visual,
  reverse,
}: {
  title: string;
  description: string;
  visual: React.ReactNode;
  reverse: boolean;
}) {
  return (
    <div className="grid items-center gap-8 sm:gap-12 lg:grid-cols-2">
      <div className={reverse ? "lg:order-2" : ""}>
        <h3 className="text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
          {title}
        </h3>
        <p className="mt-3 text-base leading-relaxed text-zinc-400 sm:text-lg">
          {description}
        </p>
      </div>
      <div className={reverse ? "lg:order-1" : ""}>{visual}</div>
    </div>
  );
}
