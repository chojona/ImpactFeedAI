import Link from "next/link";

import { Header } from "@/components/Header";

/**
 * Reached both when the id does not exist and when `DATABASE_URL` is unset —
 * the copy names the second case explicitly, because a developer seeing this
 * page locally is far more likely to be missing a connection string than a row.
 */
export default function EventNotFound() {
  return (
    <div className="flex flex-1 flex-col bg-[#080C10] text-zinc-100">
      <Header />
      <main className="mx-auto w-full max-w-2xl px-5 py-24 text-center sm:px-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500">
          404
        </p>
        <h1 className="mt-4 text-2xl font-semibold text-zinc-100">
          Event not found
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          No event in the library has this id. It may have been removed by a
          re-ingestion, or the database connection may not be configured — the
          event routes read Postgres through{" "}
          <code className="text-zinc-300">DATABASE_URL</code>.
        </p>
        <Link
          href="/feed"
          className="mt-8 inline-flex rounded-md border border-white/10 bg-white/[0.03] px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-zinc-200 transition hover:border-white/20 hover:text-zinc-50"
        >
          Back to the event library
        </Link>
      </main>
    </div>
  );
}
