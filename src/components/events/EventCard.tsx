"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type {
  AssetReaction,
  EventCategory,
  NewsEvent,
} from "@/lib/types";

const CATEGORY_STYLES: Record<
  EventCategory,
  { label: string; className: string }
> = {
  TARIFF: { label: "Tariff", className: "bg-[#FF6B35]/15 text-[#FF6B35]" },
  FED: { label: "Fed", className: "bg-purple-500/15 text-purple-300" },
  INFLATION: { label: "Inflation", className: "bg-red-500/15 text-red-300" },
  GEOPOLITICAL: {
    label: "Geopolitical",
    className: "bg-yellow-500/15 text-yellow-300",
  },
  EARNINGS: { label: "Earnings", className: "bg-blue-500/15 text-blue-300" },
  OTHER: { label: "Other", className: "bg-zinc-500/15 text-zinc-300" },
};

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const parseNumeric = (raw: string): number | null => {
  const match = raw.match(/-?\d+(?:\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
};

const surpriseColorClass = (expected: string, actual: string): string => {
  const e = parseNumeric(expected);
  const a = parseNumeric(actual);
  if (e === null || a === null || e === a) return "text-zinc-300";
  return a > e ? "text-red-400" : "text-[#00FF94]";
};

type Props = { event: NewsEvent };

export function EventCard({ event }: Props) {
  const [expanded, setExpanded] = useState(false);
  const category = CATEGORY_STYLES[event.category];
  const showSurprise =
    typeof event.expectedValue === "string" &&
    typeof event.actualValue === "string";

  return (
    <motion.article
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 320, damping: 24 }}
      className="flex flex-col gap-4 rounded-lg border border-white/5 bg-white/[0.02] p-5 transition-colors hover:border-white/10 hover:bg-white/[0.04]"
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={`rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${category.className}`}
        >
          {category.label}
        </span>
        <time className="text-xs text-zinc-500">{formatDate(event.date)}</time>
      </div>

      <div>
        <h3 className="text-lg font-semibold leading-snug text-zinc-50">
          {event.title}
        </h3>
        <p className="mt-1 text-sm text-zinc-400">{event.summary}</p>
      </div>

      {showSurprise && event.expectedValue && event.actualValue && (
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-zinc-800/60 px-3 py-1 text-xs text-zinc-400">
            Expected
            <span className="ml-1.5 font-mono font-semibold text-zinc-300">
              {event.expectedValue}
            </span>
          </span>
          <span
            className={`rounded-full bg-zinc-800/60 px-3 py-1 text-xs text-zinc-400 ${surpriseColorClass(
              event.expectedValue,
              event.actualValue,
            )}`}
          >
            Actual
            <span className="ml-1.5 font-mono font-semibold">
              {event.actualValue}
            </span>
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {event.assets.map((asset) => (
          <AssetBadge key={asset.symbol} asset={asset} />
        ))}
      </div>

      <div>
        <p
          className={`text-sm leading-relaxed text-zinc-400 ${
            expanded ? "" : "line-clamp-2"
          }`}
        >
          {event.explanation}
        </p>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className="relative z-10 mt-2 text-xs font-medium text-[#00FF94] hover:underline focus:outline-none"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      </div>
    </motion.article>
  );
}

function AssetBadge({ asset }: { asset: AssetReaction }) {
  const colorClass =
    asset.direction === "UP"
      ? "bg-[#00FF94]/10 text-[#00FF94]"
      : asset.direction === "DOWN"
        ? "bg-red-500/10 text-red-400"
        : "bg-zinc-700/40 text-zinc-300";
  const sign = asset.percentChange > 0 ? "+" : "";

  return (
    <span
      className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ${colorClass}`}
    >
      <span className="font-semibold text-zinc-200">{asset.symbol}</span>
      <span className="font-mono font-semibold">
        {sign}
        {asset.percentChange.toFixed(2)}%
      </span>
    </span>
  );
}
