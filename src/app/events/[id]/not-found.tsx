import Link from "next/link";

import { Header } from "@/components/Header";

/**
 * Reached both when the id does not exist and when `DATABASE_URL` is unset —
 * the copy names the second case explicitly, because a developer seeing this
 * page locally is far more likely to be missing a connection string than a row.
 */
export default function EventNotFound() {
  return (
    <div className="flex flex-1 flex-col bg-canvas text-ink-2">
      <Header active="feed" />
      <main className="mx-auto w-full max-w-2xl px-5 py-24 sm:px-6">
        <p className="eyebrow">404</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">
          Event not found
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-3">
          No event in the library has this id. It may have been removed by a
          re-ingestion, or the database connection may not be configured — the
          event routes read Postgres through{" "}
          <code className="num text-ink-2">DATABASE_URL</code>.
        </p>
        <Link
          href="/feed"
          className="mt-8 inline-flex rounded-lg border border-line bg-white/[0.03] px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-2 transition-colors hover:border-line-strong hover:bg-white/[0.06] hover:text-ink"
        >
          Back to the event library
        </Link>
      </main>
    </div>
  );
}
