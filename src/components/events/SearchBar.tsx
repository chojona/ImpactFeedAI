"use client";

import { useId } from "react";
import { Search, X } from "lucide-react";

/**
 * Search input for the event library.
 *
 * The focus treatment moved from a Framer Motion `animate` on `borderColor` and
 * `boxShadow` to a CSS `focus-within` ring. Two reasons: it now matches the one
 * focus style the whole application uses (`globals.css`), and animating a focus
 * ring in JavaScript meant the keyboard affordance depended on a hydrated
 * animation library.
 *
 * The input carries a real `<label>` rather than relying on the placeholder,
 * which disappears exactly when a screen-reader user needs it most.
 */
interface Props {
  value: string;
  onChange: (value: string) => void;
  resultCount: number;
}

export function SearchBar({ value, onChange, resultCount }: Props) {
  const id = useId();
  const hasValue = value.length > 0;

  // The ring lives on the wrapper, so the icon, count and clear button are all
  // inside the focus indicator — hence `focus:outline-none` on the input itself
  // rather than a missing focus state.
  return (
    <div className="surface-lift relative flex items-center rounded-lg border border-line bg-surface-1 transition-colors focus-within:border-brand/60 focus-within:bg-surface-2 focus-within:ring-2 focus-within:ring-brand/25 hover:border-line-brand">
      <label htmlFor={id} className="sr-only">
        Search events by title or metric
      </label>
      <Search
        aria-hidden
        className="ml-3 h-4 w-4 shrink-0 text-ink-4"
        strokeWidth={2}
      />
      <input
        id={id}
        type="search"
        placeholder="Search events…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-transparent px-3 py-2.5 text-sm text-ink placeholder-ink-4 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {hasValue && (
        <>
          <span className="num mr-2 shrink-0 text-[11px] text-ink-3">
            {resultCount} {resultCount === 1 ? "result" : "results"}
          </span>
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Clear search"
            className="mr-2 rounded p-1 text-ink-3 transition-colors hover:bg-brand-tint hover:text-ink"
          >
            <X aria-hidden className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  );
}
