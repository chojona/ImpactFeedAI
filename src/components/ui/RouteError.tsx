"use client";

import { useEffect } from "react";

import { Header } from "@/components/Header";
import { buttonClass } from "@/components/ui/Button";
import { DataStatePanel } from "@/components/ui/DataStatePanel";

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
    <div className="flex flex-1 flex-col text-ink-2">
      <Header />
      <main className="mx-auto w-full max-w-2xl px-5 py-24 sm:px-6">
        <DataStatePanel state="error" title={title} footnote={footnote(error)}>
          {description}
        </DataStatePanel>
        <button
          type="button"
          onClick={retry}
          className={buttonClass("primary", "md", "mt-6")}
        >
          Try again
        </button>
      </main>
    </div>
  );
}

/**
 * `digest` is the only handle a reader has on a server error whose message React
 * deliberately withholds from the browser, so it is surfaced — quietly, as a
 * footnote rather than as the headline.
 */
function footnote(error: Error & { digest?: string }): React.ReactNode {
  if (error.digest === undefined) return undefined;
  return (
    <>
      Digest <span className="num text-ink-3">{error.digest}</span>
    </>
  );
}
