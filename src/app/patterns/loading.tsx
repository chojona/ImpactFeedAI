import { Header } from "@/components/Header";

/** Streamed while the coverage aggregates and category observations are read. */
export default function Loading() {
  return (
    <div className="flex flex-1 flex-col bg-[#080C10]">
      <Header />
      <div
        className="mx-auto w-full max-w-6xl px-5 pt-12 pb-24 sm:px-6"
        aria-busy="true"
        aria-label="Loading pattern library"
      >
        <div className="h-9 w-64 animate-pulse rounded bg-white/[0.05]" />
        <div className="mt-4 h-12 w-full max-w-3xl animate-pulse rounded bg-white/[0.03]" />
        <div className="mt-12 h-64 animate-pulse rounded-lg bg-white/[0.03]" />
        <div className="mt-14 h-80 animate-pulse rounded-lg bg-white/[0.03]" />
      </div>
    </div>
  );
}
