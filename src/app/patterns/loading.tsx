import { Header } from "@/components/Header";

/** Streamed while the coverage aggregates and category observations are read. */
export default function Loading() {
  return (
    <div className="flex flex-1 flex-col">
      <Header active="patterns" />
      <div
        className="mx-auto w-full max-w-6xl px-5 pt-12 pb-24 sm:px-6"
        aria-busy="true"
        aria-label="Loading pattern library"
      >
        {/* Shaped like the real page: title, lede, totals strip, then the two
            table sections. Reserving the right boxes means the layout does not
            jump when the aggregates land. */}
        <div className="h-3 w-32 animate-pulse rounded bg-white/[0.04]" />
        <div className="mt-3 h-9 w-64 animate-pulse rounded bg-white/[0.05]" />
        <div className="mt-4 h-10 w-full max-w-2xl animate-pulse rounded bg-white/[0.03]" />
        <div className="mt-8 h-[86px] animate-pulse rounded-lg border border-line bg-surface-1" />
        <div className="mt-12 h-72 animate-pulse rounded-lg border border-line bg-surface-1" />
        <div className="mt-14 h-96 animate-pulse rounded-lg border border-line bg-surface-1" />
      </div>
    </div>
  );
}
