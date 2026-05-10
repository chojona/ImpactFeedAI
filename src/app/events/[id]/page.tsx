import { notFound } from "next/navigation";

import { ChartReplayPanel } from "@/components/charts/ChartReplayPanel";
import { BackButton } from "@/components/ui/BackButton";
import { assetReasoning } from "@/lib/assetReasoning";
import { eventTimes, mockChartData } from "@/lib/mockChartData";
import { mockEvents } from "@/lib/mockEvents";
import { CATEGORY_CONFIG } from "@/lib/types";

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

const parseNumeric = (raw: string): number | null => {
  const m = raw.match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
};

const surpriseColor = (
  expected: string,
  actual: string,
  higherIsBetter: boolean,
): string => {
  const e = parseNumeric(expected);
  const a = parseNumeric(actual);
  if (e === null || a === null || e === a) return "text-zinc-300";
  const isPositiveSurprise = higherIsBetter ? a > e : a < e;
  return isPositiveSurprise ? "text-[#00FF94]" : "text-red-400";
};

export function generateStaticParams(): { id: string }[] {
  return mockEvents.map((event) => ({ id: event.id }));
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EventDetailPage({ params }: PageProps) {
  const { id } = await params;
  const event = mockEvents.find((e) => e.id === id);
  if (!event) notFound();

  const charts = mockChartData[event.id] ?? {};
  const eventTime = eventTimes[event.id] ?? "";
  const reasoning = assetReasoning[event.id] ?? {};
  const categoryColor = CATEGORY_CONFIG[event.category].color;
  const showSurprise =
    typeof event.expectedValue === "string" &&
    typeof event.actualValue === "string";

  return (
    <div className="flex flex-1 flex-col bg-[#080C10] text-zinc-100">
      <div className="mx-auto w-full max-w-5xl px-6 pt-10 pb-24">
        <BackButton />

        <div className="mt-8 flex items-center gap-3">
          <span
            className="rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]"
            style={{
              backgroundColor: `${categoryColor}20`,
              color: categoryColor,
              border: `1px solid ${categoryColor}40`,
            }}
          >
            {event.category}
          </span>
          <time className="text-sm text-zinc-500">
            {formatDate(event.date)}
          </time>
        </div>

        <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-zinc-50 sm:text-4xl">
          {event.title}
        </h1>
        <p className="mt-3 text-lg leading-relaxed text-zinc-400">
          {event.summary}
        </p>

        {showSurprise && event.expectedValue && event.actualValue && (
          <div className="mt-6 flex flex-wrap gap-2">
            <span className="rounded-full bg-zinc-800/60 px-4 py-1.5 text-sm text-zinc-400">
              Expected
              <span className="ml-2 font-mono font-semibold text-zinc-300">
                {event.expectedValue}
              </span>
            </span>
            <span
              className={`rounded-full bg-zinc-800/60 px-4 py-1.5 text-sm text-zinc-400 ${surpriseColor(
                event.expectedValue,
                event.actualValue,
                CATEGORY_CONFIG[event.category].higherIsBetter,
              )}`}
            >
              Actual
              <span className="ml-2 font-mono font-semibold">
                {event.actualValue}
              </span>
            </span>
          </div>
        )}

        <p className="mt-8 text-base leading-relaxed text-zinc-300">
          {event.explanation}
        </p>

        <SectionHeading>Market Reaction</SectionHeading>

        <ChartReplayPanel
          assets={event.assets}
          charts={charts}
          eventTime={eventTime}
        />

        <SectionHeading>What This Means</SectionHeading>

        <ul className="space-y-5">
          {event.assets.map((asset) => {
            const text = reasoning[asset.symbol];
            if (!text) return null;
            const moveColor =
              asset.direction === "UP"
                ? "text-[#00FF94]"
                : asset.direction === "DOWN"
                  ? "text-red-400"
                  : "text-zinc-400";
            const sign = asset.percentChange > 0 ? "+" : "";
            return (
              <li
                key={asset.symbol}
                className="flex flex-col gap-2 sm:flex-row sm:gap-5"
              >
                <div className="flex shrink-0 items-baseline gap-3 sm:w-28 sm:flex-col sm:items-start sm:gap-1">
                  <span className="font-semibold text-zinc-100">
                    {asset.symbol}
                  </span>
                  <span
                    className={`font-mono text-sm font-semibold ${moveColor}`}
                  >
                    {sign}
                    {asset.percentChange.toFixed(2)}%
                  </span>
                </div>
                <p className="flex-1 text-sm leading-relaxed text-zinc-400">
                  {text}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-12 mb-6 flex items-center gap-4">
      <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
        {children}
      </h2>
      <div className="h-px flex-1 bg-white/5" />
    </div>
  );
}
