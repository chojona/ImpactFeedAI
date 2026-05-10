import { Header } from "@/components/Header";
import { PatternCard } from "@/components/patterns/PatternCard";
import { mockEvents } from "@/lib/mockEvents";
import { analyzeCategory } from "@/lib/patternAnalysis";
import type { EventCategory } from "@/lib/types";

const CATEGORIES: EventCategory[] = [
  "TARIFF",
  "INFLATION",
  "FED",
  "GEOPOLITICAL",
  "EARNINGS",
];

export default function PatternsPage() {
  const patterns = CATEGORIES.map((c) => analyzeCategory(mockEvents, c)).filter(
    (p) => p.sampleSize >= 2,
  );

  return (
    <div className="flex flex-1 flex-col bg-[#080C10] text-zinc-100">
      <Header />
      <section className="mx-auto w-full max-w-5xl px-6 pt-16 pb-24">
        <h1 className="text-4xl font-semibold leading-tight tracking-tight text-zinc-50 sm:text-5xl">
          Pattern Library
        </h1>
        <p className="mt-3 max-w-2xl text-lg leading-relaxed text-zinc-400">
          How markets historically react to each news type. Aggregate moves
          across every event in our library — the average direction, the
          biggest movers, and how consistently each asset reacts.
        </p>
        <div className="mt-12 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {patterns.map((p) => (
            <PatternCard key={p.category} pattern={p} />
          ))}
        </div>
      </section>
    </div>
  );
}
