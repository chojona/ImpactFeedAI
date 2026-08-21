import Link from "next/link";

import { ScrollableTable } from "@/components/ui/ScrollableTable";
import { categoryPillColor } from "@/components/ui/categoryPill";
import type {
  CategoryCoverage,
  LibraryCoverage,
} from "@/services/events/eventQueries";

/**
 * What the library actually holds, per category.
 *
 * This exists because the honest answer to "what can I research here" is
 * currently *not* "everything", and hiding that behind an empty chart would be
 * the least useful possible design. Every number is a row count from Postgres.
 *
 * The timing bar is the gate on every reaction in the product: only the
 * verified/scheduled segment can ever produce a price move. Rendering the other
 * segments beside it makes the size of the remaining data-provider work visible
 * rather than mysterious.
 */

const SEGMENTS = [
  {
    key: "trustedTiming",
    label: "Verified or scheduled",
    color: "#00FF94",
    description: "Exact instant with named provenance — reactions can be measured.",
  },
  {
    key: "dateOnly",
    label: "Date only",
    color: "#F59E0B",
    description: "Publication date known, no defensible release time.",
  },
  {
    key: "referencePeriodOnly",
    label: "Reference period only",
    color: "#64748B",
    description: "Only the period the statistic measures is known.",
  },
  {
    key: "untrustedTiming",
    label: "Inferred or unverified",
    color: "#3F3F46",
    description: "Timing exists but is not backed by a release record.",
  },
] as const satisfies readonly {
  key: keyof Omit<CategoryCoverage, "category">;
  label: string;
  color: string;
  description: string;
}[];

interface Props {
  coverage: LibraryCoverage;
}

export function CoverageTable({ coverage }: Props) {
  const rows = coverage.categories.filter((c) => c.events > 0);
  if (rows.length === 0) return null;

  return (
    <div>
      <ScrollableTable label="Library coverage by category">
        <table className="w-full min-w-[600px] border-collapse text-sm">
          <caption className="sr-only">
            Event count, release-timing provenance and consensus coverage for
            each category.
          </caption>
          <thead>
            <tr className="border-b border-line-strong text-left">
              <Th className="sticky left-0 z-10 bg-surface-1 pr-3">Category</Th>
              <Th className="px-3 text-right">Events</Th>
              <Th className="px-3">Release-timing provenance</Th>
              <Th className="px-3 text-right">Priced</Th>
              <Th className="pl-3 text-right">Consensus</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <CoverageRow key={row.category} row={row} />
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line-strong">
              <th
                scope="row"
                className="sticky left-0 z-10 bg-surface-1 py-3 pr-3 text-left"
              >
                <span className="eyebrow text-ink-2">All categories</span>
              </th>
              <td className="num px-3 py-3 text-right text-[13px] font-semibold text-ink">
                {coverage.totals.events.toLocaleString()}
              </td>
              <td className="px-3 py-3">
                <TimingBar row={{ ...coverage.totals, category: "OTHER" }} />
              </td>
              <td className="num px-3 py-3 text-right text-[13px] font-semibold text-ink">
                {coverage.totals.measuredEvents.toLocaleString()}
              </td>
              <td className="num py-3 pl-3 text-right text-[13px] font-semibold text-ink">
                {coverage.totals.consensusVerified.toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>
      </ScrollableTable>

      {/* The legend is the key to the only chart on this page, so it carries
          each segment's meaning rather than only its name. */}
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        {SEGMENTS.map((segment) => (
          <li
            key={segment.key}
            className="flex items-center gap-2 text-[11px] text-ink-3"
            title={segment.description}
          >
            <span
              aria-hidden
              className="h-2 w-2 rounded-sm"
              style={{ backgroundColor: segment.color }}
            />
            {segment.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CoverageRow({ row }: { row: CategoryCoverage }) {
  const color = categoryPillColor(row.category);
  return (
    <tr className="group border-b border-line last:border-0 hover:bg-white/[0.02]">
      <th
        scope="row"
        className="sticky left-0 z-10 bg-surface-1 py-2.5 pr-3 text-left group-hover:bg-surface-2"
      >
        <Link
          href={`/patterns?cat=${row.category}`}
          className="rounded font-mono text-[11px] font-semibold uppercase tracking-[0.14em] transition hover:underline"
          style={{ color }}
        >
          {row.category}
        </Link>
      </th>
      <td className="num px-3 py-2.5 text-right text-[13px] text-ink-2">
        {row.events.toLocaleString()}
      </td>
      <td className="px-3 py-2.5">
        <TimingBar row={row} />
      </td>
      <td
        className={`num px-3 py-2.5 text-right text-[13px] ${
          row.measuredEvents > 0 ? "text-pos" : "text-ink-4"
        }`}
        title="Events with at least one current-version measured one-session move"
      >
        {row.measuredEvents.toLocaleString()}
      </td>
      <td
        className={`num py-2.5 pl-3 text-right text-[13px] ${
          row.consensusVerified > 0 ? "text-pos" : "text-ink-4"
        }`}
        title={`${row.consensusVerified} verified · ${row.consensusUnverified} unverified · ${row.consensusMissing} missing`}
      >
        {row.consensusVerified.toLocaleString()}
      </td>
    </tr>
  );
}

function TimingBar({ row }: { row: CategoryCoverage }) {
  const total = SEGMENTS.reduce((acc, s) => acc + row[s.key], 0);
  if (total === 0) {
    return <span className="text-[11px] text-ink-4">No events</span>;
  }
  return (
    <span
      className="flex h-2.5 w-full min-w-[140px] overflow-hidden rounded-sm bg-white/[0.04]"
      title={SEGMENTS.filter((s) => row[s.key] > 0)
        .map((s) => `${s.label}: ${row[s.key]}`)
        .join(" · ")}
    >
      {SEGMENTS.map((segment) => {
        const n = row[segment.key];
        if (n === 0) return null;
        const anchorable = segment.key === "trustedTiming";
        return (
          <span
            key={segment.key}
            style={{
              width: `${(n / total) * 100}%`,
              backgroundColor: segment.color,
              opacity: anchorable ? 0.92 : 0.45,
              // Segments that can never anchor a price window are hatched as
              // well as dimmed. A category whose bar is entirely flat grey
              // otherwise reads as "full" at a glance, when it actually means
              // "none of this is measurable" — the opposite conclusion.
              backgroundImage: anchorable
                ? undefined
                : "repeating-linear-gradient(135deg, rgba(255,255,255,0.16) 0 1px, transparent 1px 5px)",
            }}
          />
        );
      })}
    </span>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`eyebrow py-2 ${className}`}
    >
      {children}
    </th>
  );
}
