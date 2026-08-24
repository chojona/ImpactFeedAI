import Link from "next/link";

import { CategoryBadge } from "@/components/ui/CategoryBadge";
import { MiniReactionBars } from "@/components/reactions/MiniReactionBars";
import { ReleaseValueInline } from "@/components/events/ReleaseValues";
import { isDatabaseConfigured } from "@/lib/prisma";
import {
  getFeaturedEvent,
  getLibrarySummary,
  type LibrarySummary,
} from "@/services/events/eventQueries";
import { formatNewYorkDateTime } from "@/services/events/timing";
import type { NewsEvent } from "@/types/events";

/**
 * The hero panel, rendered from the database.
 *
 * This replaced a hand-written preview card showing `SPY −4.84%` for an event
 * that was never measured. A fabricated number on a marketing page is still a
 * fabricated number, and it is the one most likely to be screenshotted.
 *
 * Three honest states, in order of how much the database can support:
 *
 *   1. a real event with a measured cross-asset reaction;
 *   2. real library counts, when events exist but none is priced yet — which is
 *      the current state, and saying so is more credible than hiding it;
 *   3. a description of the record's fields and no numbers at all, when there
 *      is no database to read.
 *
 * Every failure mode falls through to state 3 rather than throwing: the landing
 * page must render without a database, which is also how it renders in CI.
 */
type PanelData =
  | { kind: "event"; event: NewsEvent }
  | { kind: "summary"; summary: LibrarySummary }
  | { kind: "fields" };

/**
 * Resolve the richest state the database can support. Reading is separated
 * from rendering so the try/catch wraps only the queries — JSX constructed
 * inside a try/catch is not actually covered by it, because React renders it
 * later.
 */
async function loadPanelData(): Promise<PanelData> {
  if (!isDatabaseConfigured()) return { kind: "fields" };
  try {
    const event = await getFeaturedEvent();
    if (event !== null) return { kind: "event", event };
    const summary = await getLibrarySummary();
    if (summary.events > 0) return { kind: "summary", summary };
  } catch (error) {
    console.error("[landing] preview panel query failed:", error);
  }
  return { kind: "fields" };
}

export async function LivePreviewPanel() {
  const data = await loadPanelData();
  if (data.kind === "event") return <FeaturedEventPanel event={data.event} />;
  if (data.kind === "summary")
    return <LibrarySnapshotPanel summary={data.summary} />;
  return <FieldsPanel />;
}

function PanelFrame({
  eyebrow,
  badge,
  children,
}: {
  eyebrow: string;
  badge: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between px-1 pb-2">
        <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-3">
          <span className="h-1.5 w-1.5 rounded-full bg-brand shadow-[0_0_8px_1px_rgba(91,124,250,0.55)]" />
          {eyebrow}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-3">
          {badge}
        </span>
      </div>
      <article className="surface-lift overflow-hidden rounded-xl border border-line-strong bg-surface-1 shadow-[0_34px_90px_-48px_rgba(0,0,0,0.85)]">
        {children}
      </article>
    </div>
  );
}

function FeaturedEventPanel({ event }: { event: NewsEvent }) {
  const released = formatNewYorkDateTime(event.timing.releaseAt);

  return (
    <PanelFrame eyebrow="Largest measured move" badge="Live from the library">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <CategoryBadge category={event.category} />
        {released !== null && event.timing.releaseAt !== null && (
          <time
            dateTime={event.timing.releaseAt}
            className="font-mono text-[11px] text-ink-3"
          >
            {released}
          </time>
        )}
      </div>

      <div className="px-5 pt-4 pb-3">
        <h2 className="font-mono text-[15px] font-semibold leading-snug text-ink">
          {event.title}
        </h2>
        {event.release !== null && (
          <div className="mt-3">
            <ReleaseValueInline
              release={event.release}
              category={event.category}
            />
          </div>
        )}
      </div>

      <div className="border-t border-line px-5 py-4">
        <p className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-3">
          Cross-asset reaction
        </p>
        {/* `offset={0}` because this panel has no separate headline figure of
            its own — the leader belongs in the bars here. */}
        <MiniReactionBars
          assets={event.assets}
          window="1d"
          limit={4}
          offset={0}
        />
      </div>

      <div className="border-t border-line px-5 py-3">
        <Link
          href={`/events/${event.id}`}
          className="inline-flex items-center gap-1 font-mono text-xs font-medium text-brand-bright transition-colors hover:text-ink"
        >
          Open the full reaction ↗
        </Link>
      </div>
    </PanelFrame>
  );
}

function LibrarySnapshotPanel({ summary }: { summary: LibrarySummary }) {
  const span =
    summary.earliest === null || summary.latest === null
      ? null
      : `${summary.earliest.slice(0, 4)}–${summary.latest.slice(0, 4)}`;

  return (
    <PanelFrame eyebrow="Library snapshot" badge="Live counts">
      <dl className="grid grid-cols-2 gap-px bg-line">
        <Stat label="Events ingested" value={summary.events.toLocaleString()} />
        <Stat
          label="Instruments tracked"
          value={summary.instruments.toLocaleString()}
        />
        <Stat label="Event categories" value={String(summary.categories)} />
        <Stat label="Coverage span" value={span ?? "—"} />
      </dl>
      <div className="border-t border-line px-5 py-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-warn">
          {summary.measuredEvents.toLocaleString()} priced
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-3">
          A price reaction is only computed where the exact release instant is
          backed by a named source. Most of the library is bulk FRED/BLS history
          that publishes a reference period, not a release time, so those events
          are searchable but deliberately unpriced.
        </p>
        <Link
          href="/patterns"
          className="mt-3 inline-flex font-mono text-xs font-medium text-brand-bright transition-colors hover:text-ink"
        >
          See the full coverage table ↗
        </Link>
      </div>
    </PanelFrame>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#0B1116] px-5 py-4">
      <dt className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-3">
        {label}
      </dt>
      <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums text-ink">
        {value}
      </dd>
    </div>
  );
}

/**
 * The zero-data state: what a record contains, with no values attached.
 * Structure is a claim the code can back; numbers would not be.
 */
const RECORD_FIELDS = [
  "Metric, reference period and canonical unit",
  "Actual, consensus and prior — each nullable, never zero-filled",
  "Exact release instant, its status and its named source",
  "Per-instrument move at 1H, 1D and 1W with the baseline bar used",
] as const;

function FieldsPanel() {
  return (
    <PanelFrame eyebrow="What a record holds" badge="No database connected">
      <ul className="divide-y divide-white/[0.05]">
        {RECORD_FIELDS.map((field) => (
          <li
            key={field}
            className="flex gap-3 px-5 py-3.5 text-[13px] leading-snug text-ink-2"
          >
            <span
              aria-hidden
              className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-brand-bright"
            />
            {field}
          </li>
        ))}
      </ul>
      <p className="border-t border-line px-5 py-3 text-[12px] text-ink-3">
        Set <code className="text-ink-2">DATABASE_URL</code> to read the live
        library.
      </p>
    </PanelFrame>
  );
}
