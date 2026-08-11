import Link from "next/link";
import { CATEGORY_CONFIG } from "@/lib/eventCategories";
import type {
  AssetPattern,
  CategoryPattern,
} from "@/services/analytics/patternAnalysis";

interface Props {
  pattern: CategoryPattern;
}

export function PatternCard({ pattern }: Props) {
  const config = CATEGORY_CONFIG[pattern.category];
  const maxAbs = Math.max(
    1e-6,
    ...pattern.avgReactions.map((a) => Math.abs(a.avgPercentChange)),
  );

  return (
    <article className="flex flex-col gap-4 rounded-lg border border-white/5 bg-white/[0.02] p-5">
      <div className="flex items-center gap-3">
        <span
          className="rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]"
          style={{
            backgroundColor: `${config.color}26`,
            color: config.color,
          }}
        >
          {pattern.category}
        </span>
        <span className="font-mono text-xs tabular-nums text-zinc-500">
          {pattern.measuredSampleSize}{" "}
          {pattern.measuredSampleSize === 1 ? "event" : "events"}
          {pattern.sampleSize > pattern.measuredSampleSize && (
            <span className="ml-1 text-zinc-600">
              of {pattern.sampleSize} measured
            </span>
          )}
        </span>
      </div>

      <div className="space-y-3">
        {pattern.avgReactions.map((asset) => (
          <BarRow key={asset.symbol} asset={asset} maxAbs={maxAbs} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-white/5 pt-4">
        <Callout
          label="Most consistent"
          value={pattern.mostConsistentAsset}
        />
        <Callout label="Biggest mover" value={pattern.biggestMover} />
      </div>

      <Link
        href={`/feed?cat=${pattern.category}`}
        className="text-xs font-semibold uppercase tracking-wider text-[#00FF94] transition hover:text-[#00FF94]/80"
      >
        View all {pattern.category} events →
      </Link>
    </article>
  );
}

function BarRow({ asset, maxAbs }: { asset: AssetPattern; maxAbs: number }) {
  const isUp = asset.avgPercentChange >= 0;
  const widthPct = (Math.abs(asset.avgPercentChange) / maxAbs) * 50;
  const sign = asset.avgPercentChange > 0 ? "+" : "";

  return (
    <div className="grid grid-cols-[56px_1fr_72px] items-center gap-3">
      <span className="text-sm font-semibold text-zinc-200">
        {asset.symbol}
      </span>
      <div>
        <div className="relative h-5 rounded bg-white/[0.02]">
          <div className="absolute inset-y-0 left-1/2 w-px bg-white/15" />
          <div
            className={`absolute inset-y-0 ${
              isUp
                ? "rounded-r bg-[#00FF94]/40"
                : "rounded-l bg-red-400/40"
            }`}
            style={
              isUp
                ? { left: "50%", width: `${widthPct}%` }
                : { right: "50%", width: `${widthPct}%` }
            }
          />
        </div>
        <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
          consistent {Math.round(asset.winRate * 100)}% · n={asset.eventCount}
        </div>
      </div>
      <span
        className={`text-right font-mono text-sm font-semibold ${
          isUp ? "text-[#00FF94]" : "text-red-400"
        }`}
      >
        {sign}
        {asset.avgPercentChange.toFixed(2)}%
      </span>
    </div>
  );
}

function Callout({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className="mt-1 font-mono text-sm font-semibold text-zinc-200">
        {value ?? "—"}
      </div>
    </div>
  );
}
