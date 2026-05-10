"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Search, X } from "lucide-react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  resultCount: number;
}

export function SearchBar({ value, onChange, resultCount }: Props) {
  const [focused, setFocused] = useState(false);
  const hasValue = value.length > 0;

  return (
    <motion.div
      initial={false}
      animate={{
        borderColor: focused
          ? "rgba(0, 255, 148, 0.55)"
          : "rgba(255, 255, 255, 0.08)",
        boxShadow: focused
          ? "0 0 0 3px rgba(0, 255, 148, 0.14)"
          : "0 0 0 0 rgba(0, 255, 148, 0)",
      }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="relative flex items-center rounded-lg border bg-white/[0.02]"
    >
      <Search className="ml-3 h-4 w-4 shrink-0 text-zinc-500" />
      <input
        type="text"
        placeholder="Search events..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="flex-1 bg-transparent px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
      />
      {hasValue && (
        <span className="mr-2 font-mono text-xs tabular-nums text-zinc-500">
          {resultCount} {resultCount === 1 ? "result" : "results"}
        </span>
      )}
      {hasValue && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="mr-2 rounded p-1 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </motion.div>
  );
}
