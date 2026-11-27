import Link from "next/link";

/**
 * Site-wide data source attribution.
 *
 * Notices are the verified provider terms quoted on /legal. The footer keeps
 * a short pointer so every research route carries the required attribution
 * without repeating the full legal page.
 */
export function DataAttribution() {
  return (
    <footer className="border-t border-line bg-canvas/60">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-6 text-ink-3 sm:px-6">
        <p className="caption">
          This product uses the FRED® API but is not endorsed or certified by
          the Federal Reserve Bank of St. Louis. BLS.gov cannot vouch for the
          data or analyses derived from these data after the data have been
          retrieved from BLS.gov. Market prices are shown for personal
          research only and are not investment advice.
        </p>
        <p className="caption">
          Full source notices and research disclaimers:{" "}
          <Link
            href="/legal"
            className="text-brand-bright underline-offset-2 hover:underline"
          >
            Legal &amp; attribution
          </Link>
          .
        </p>
      </div>
    </footer>
  );
}
