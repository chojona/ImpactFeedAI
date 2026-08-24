import {
  Bot,
  GitCompare,
  Layers,
  LineChart,
  Network,
  Target,
} from "lucide-react";

/**
 * Capability grid.
 *
 * Each entry carries a `status`, and the planned ones are labelled as planned
 * on the card. The previous version described the AI explainer, the similar-
 * event finder and paper trading in the present tense alongside features that
 * exist, which is a claim the repository cannot support.
 */

type Status = "live" | "planned";

interface Capability {
  index: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  status: Status;
}

const CAPABILITIES: Capability[] = [
  {
    index: "01",
    icon: <Target className="h-4 w-4" />,
    title: "Release breakdowns",
    description:
      "Actual, consensus, prior and surprise in the metric's canonical unit, each with its source, its as-of instant and its verification status. A value nobody recorded reads as unavailable, never as zero.",
    status: "live",
  },
  {
    index: "02",
    icon: <Network className="h-4 w-4" />,
    title: "Cross-asset reaction",
    description:
      "How a release travelled through equity indices, rates, the dollar, gold, oil and crypto at 1H, 1D and 1W — ranked by magnitude, with the pre-release baseline bar named for every measurement.",
    status: "live",
  },
  {
    index: "03",
    icon: <Layers className="h-4 w-4" />,
    title: "Searchable event archive",
    description:
      "Filter by category, search the library, and sort by the largest measured one-session move. Events with unverifiable timing stay searchable and stay unpriced.",
    status: "live",
  },
  {
    index: "04",
    icon: <GitCompare className="h-4 w-4" />,
    title: "Pattern library",
    description:
      "Median and observed range per instrument per horizon across comparable events, with the sample size beside every figure and the individual observations one click away.",
    status: "live",
  },
  {
    index: "05",
    icon: <LineChart className="h-4 w-4" />,
    title: "Intraday reaction replay",
    description:
      "Candle-level playback of the minutes around a release. The schema currently stores four prices per instrument, not a series, so this needs an intraday price provider first.",
    status: "planned",
  },
  {
    index: "06",
    icon: <Bot className="h-4 w-4" />,
    title: "Retrieval-grounded research assistant",
    description:
      "Natural-language questions answered from stored rows, with every number traceable to the record it came from. Not built — and it will never answer from the model's memory.",
    status: "planned",
  },
];

export function Capabilities() {
  return (
    <section className="border-b border-line">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
        <div className="mb-12 max-w-2xl">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-3">
            Capabilities
          </span>
          <h2 className="mt-3 font-mono text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            A research workflow built around catalysts, not headlines.
          </h2>
          <p className="mt-3 font-sans text-[15px] leading-relaxed text-ink-2">
            What is built is marked live. What is not is marked planned, with the
            reason it is not built yet.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((capability) => (
            <CapabilityCard key={capability.index} capability={capability} />
          ))}
        </div>
      </div>
    </section>
  );
}

function CapabilityCard({ capability }: { capability: Capability }) {
  const planned = capability.status === "planned";
  return (
    <article className="surface-lift flex flex-col bg-surface-1 p-6 transition-colors hover:bg-surface-2 sm:p-7">
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex h-7 w-7 items-center justify-center rounded-md border ${
            planned
              ? "border-line bg-surface-2"
              : "border-brand/30 bg-brand-tint-strong"
          } ${
            planned ? "text-ink-3" : "text-brand-bright"
          }`}
        >
          {capability.icon}
        </span>
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-3">
          {capability.index}
        </span>
        <span className="h-px flex-1 bg-line" />
        <span
          className={`rounded-full border px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] ${
            planned
              ? "border-line bg-surface-2 text-ink-3"
              : "border-brand/30 bg-brand-tint-strong text-brand-bright"
          }`}
        >
          {planned ? "Planned" : "Live"}
        </span>
      </div>
      <h3 className="mt-5 font-mono text-base font-semibold tracking-tight text-ink">
        {capability.title}
      </h3>
      <p className="mt-2 font-sans text-[13px] leading-relaxed text-ink-2">
        {capability.description}
      </p>
    </article>
  );
}
