import Link from "next/link";

import { CATEGORY_CONFIG } from "@/lib/eventCategories";
import type { CategoryCoverage, LibraryCoverage } from "@/services/events/eventQueries";

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
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <caption className="sr-only">
            Event count, release-timing provenance and consensus coverage for
            each category.
          </caption>
          <thead>
            <tr className="border-b border-white/10 text-left">
              <Th className="pr-3">Category</Th>
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
            <tr className="border-t border-white/10 font-semibold">
              <th scope="row" className="py-2.5 pr-3 text-left text-xs uppercase tracking-wider text-zinc-400">
                All
              </th>
              <td className="px-3 py-2.5 text-right font-mono text-[13px] tabular-nums text-zinc-200">
                {coverage.totals.events.toLocaleString()}
              </td>
              <td className="px-3 py-2.5">
                <TimingBar row={{ ...coverage.totals, category: "OTHER" }} />
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-[13px] tabular-nums text-zinc-200">
                {coverage.totals.measuredEvents.toLocaleString()}
              </td>
              <td className="py-2.5 pl-3 text-right font-mono text-[13px] tabular-nums text-zinc-200">
                {coverage.totals.consensusVerified.toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        {SEGMENTS.map((segment) => (
          <li
            key={segment.key}
            className="flex items-center gap-2 text-[11px] text-zinc-500"
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
  const color = CATEGORY_CONFIG[row.category].color;
  return (
    <tr className="border-b border-white/[0.04] last:border-0">
      <th scope="row" className="py-2.5 pr-3 text-left">
        <Link
          href={`/patterns?cat=${row.category}`}
          className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] transition hover:underline"
          style={{ color }}
        >
          {row.category}
        </Link>
      </th>
      <td className="px-3 py-2.5 text-right font-mono text-[13px] tabular-nums text-zinc-300">
        {row.events.toLocaleString()}
      </td>
      <td className="px-3 py-2.5">
        <TimingBar row={row} />
      </td>
      <td
        className={`px-3 py-2.5 text-right font-mono text-[13px] tabular-nums ${
          row.measuredEvents > 0 ? "text-[#00FF94]" : "text-zinc-600"
        }`}
        title="Events with at least one current-version measured one-session move"
      >
        {row.measuredEvents.toLocaleString()}
      </td>
      <td
        className={`py-2.5 pl-3 text-right font-mono text-[13px] tabular-nums ${
          row.consensusVerified > 0 ? "text-[#00FF94]" : "text-zinc-600"
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
    return <span className="text-[11px] text-zinc-600">No events</span>;
  }
  return (
    <span
      className="flex h-2.5 w-full min-w-[120px] overflow-hidden rounded-sm bg-white/[0.03]"
      title={SEGMENTS.filter((s) => row[s.key] > 0)
        .map((s) => `${s.label}: ${row[s.key]}`)
        .join(" · ")}
    >
      {SEGMENTS.map((segment) => {
        const n = row[segment.key];
        if (n === 0) return null;
        return (
          <span
            key={segment.key}
            style={{
              width: `${(n / total) * 100}%`,
              backgroundColor: segment.color,
              opacity: segment.key === "trustedTiming" ? 0.9 : 0.55,
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
      className={`py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500 ${className}`}
    >
      {children}
    </th>
  );
}
