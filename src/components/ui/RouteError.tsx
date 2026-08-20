"use client";

import { useEffect } from "react";

import { Header } from "@/components/Header";

/**
 * Shared fallback for a route segment that threw.
 *
 * The research pages read Postgres directly, so the realistic failure is a
 * database that is unreachable, asleep (Neon free-tier compute suspends when
 * idle) or misconfigured. That is a different problem from "no results", and
 * the copy says so rather than rendering an empty page that looks like an empty
 * library.
 *
 * `digest` is surfaced because it is the only handle a reader has on a server
 * error whose message React deliberately withholds from the browser.
 */
interface Props {
  error: Error & { digest?: string };
  retry: () => void;
  title: string;
  description: string;
}

export function RouteError({ error, retry, title, description }: Props) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col bg-[#080C10] text-zinc-100">
      <Header />
      <main className="mx-auto w-full max-w-2xl px-5 py-24 sm:px-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#FF6B35]">
          Error
        </p>
        <h1 className="mt-4 text-2xl font-semibold text-zinc-100">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          {description}
        </p>
        {error.digest !== undefined && (
          <p className="mt-4 font-mono text-[11px] text-zinc-600">
            Digest {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={retry}
          className="mt-8 rounded-md border border-white/10 bg-white/[0.03] px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-zinc-200 transition hover:border-white/20 hover:text-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF94]/40"
        >
          Try again
        </button>
      </main>
    </div>
  );
}
