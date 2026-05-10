"use client";

import { useId } from "react";
import { motion } from "framer-motion";
import { CATEGORY_CONFIG, type EventCategory } from "@/lib/types";

export type CategoryFilter = "ALL" | Exclude<EventCategory, "OTHER">;

const FILTER_ORDER: readonly CategoryFilter[] = [
  "ALL",
  "TARIFF",
  "INFLATION",
  "FED",
  "GEOPOLITICAL",
  "EARNINGS",
];

const ALL_COLOR = "#FAFAFA";

const colorFor = (f: CategoryFilter): string =>
  f === "ALL" ? ALL_COLOR : CATEGORY_CONFIG[f].color;

interface Props {
  active: CategoryFilter;
  onChange: (filter: CategoryFilter) => void;
  counts: Record<CategoryFilter, number>;
}

export function CategoryFilterBar({ active, onChange, counts }: Props) {
  const id = useId();
  const layoutId = `filter-pill-${id}`;

  return (
    <div className="no-scrollbar -mx-1 flex overflow-x-auto px-1">
      <div className="flex gap-2">
        {FILTER_ORDER.map((f) => {
          const isActive = active === f;
          const count = counts[f] ?? 0;
          const color = colorFor(f);
          return (
            <button
              key={f}
              type="button"
              onClick={() => onChange(f)}
              className="relative flex shrink-0 items-center gap-2 rounded-full border border-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors hover:border-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
            >
              {isActive && (
                <motion.div
                  layoutId={layoutId}
                  className="absolute inset-0 rounded-full"
                  style={{ backgroundColor: color }}
                  transition={{ type: "spring", stiffness: 420, damping: 30 }}
                />
              )}
              <span
                className="relative z-10 transition-colors"
                style={{ color: isActive ? "#080C10" : color }}
              >
                {f}
              </span>
              <span
                className={`relative z-10 rounded-full px-1.5 py-0.5 font-mono text-[10px] tabular-nums transition-colors ${
                  isActive
                    ? "bg-black/20 text-current"
                    : "bg-white/5 text-zinc-400"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
