import Link from "next/link";
import { Check, Minus } from "lucide-react";

/**
 * Plan comparison.
 *
 * Rows whose capability is not built yet carry a `planned` flag and render a
 * marker, with a legend under the table. A pricing grid that lists shipped and
 * unshipped features in the same voice is the most consequential place to
 * overstate what exists, and this product's whole argument is that it does not
 * do that.
 *
 * The paid tiers have no checkout — `ctaHref: null` renders a non-interactive
 * label, because payments are deliberately not built.
 */

type CellValue = true | false | string;

interface TierColumn {
  key: "free" | "pro" | "premium";
  name: string;
  price: string;
  cadence: string;
  badge?: string;
  accent: "muted" | "primary" | "secondary";
  ctaLabel: string;
  /** null renders a non-interactive label — nothing to sign up for yet. */
  ctaHref: string | null;
}

const TIER_COLUMNS: TierColumn[] = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    cadence: "forever",
    accent: "muted",
    ctaLabel: "Start free",
    ctaHref: "/feed",
  },
  {
    key: "pro",
    name: "Pro",
    price: "$19",
    cadence: "/ month",
    accent: "primary",
    badge: "Most popular",
    ctaLabel: "Coming soon",
    ctaHref: null,
  },
  {
    key: "premium",
    name: "Premium",
    price: "$49",
    cadence: "/ month",
    accent: "secondary",
    ctaLabel: "Coming soon",
    ctaHref: null,
  },
];

interface FeatureRow {
  label: string;
  free: CellValue;
  pro: CellValue;
  premium: CellValue;
  /** The capability itself does not exist yet, on any tier. */
  planned?: boolean;
}

const FEATURE_ROWS: FeatureRow[] = [
  {
    label: "Event history",
    free: "Last 30 days",
    pro: "Full history",
    premium: "Full history",
  },
  {
    label: "Assets per event",
    free: "3 assets",
    pro: "All assets",
    premium: "All assets",
  },
  { label: "Cross-asset reaction charts", free: true, pro: true, premium: true },
  { label: "Pattern library", free: true, pro: true, premium: true },
  {
    label: "Intraday reaction replay",
    free: false,
    pro: true,
    premium: true,
    planned: true,
  },
  {
    label: "AI event explainer",
    free: false,
    pro: true,
    premium: true,
    planned: true,
  },
  {
    label: "Similar event finder",
    free: false,
    pro: true,
    premium: true,
    planned: true,
  },
  {
    label: "Live push alerts",
    free: false,
    pro: true,
    premium: true,
    planned: true,
  },
  {
    label: "AI chat (ask anything)",
    free: false,
    pro: false,
    premium: true,
    planned: true,
  },
  {
    label: "Regime change alerts",
    free: false,
    pro: false,
    premium: true,
    planned: true,
  },
  {
    label: "API access",
    free: false,
    pro: false,
    premium: true,
    planned: true,
  },
  { label: "Early feature access", free: false, pro: false, premium: true },
];

const tierNameClass = (accent: TierColumn["accent"]): string =>
  accent === "primary"
    ? "text-brand-bright"
    : accent === "secondary"
      ? "text-[#FF6B35]"
      : "text-ink-2";

/** Subtle vertical tint behind the Pro column for emphasis. */
const tierCellTintClass = (accent: TierColumn["accent"]): string =>
  accent === "primary" ? "bg-brand-tint" : "";

const tierCtaClass = (accent: TierColumn["accent"]): string => {
  if (accent === "primary")
    return "bg-brand text-canvas hover:bg-brand/90";
  if (accent === "secondary")
    return "border border-[#FF6B35]/40 bg-[#FF6B35]/[0.06] text-[#FF6B35] hover:bg-[#FF6B35]/10";
  return "border border-white/15 bg-surface-2 text-ink hover:border-white/25 hover:bg-line";
};

function renderCell(value: CellValue) {
  if (value === true) {
    return (
      <span className="inline-flex items-center justify-center">
        <Check
          className="h-4 w-4 text-brand-bright"
          strokeWidth={3}
          aria-label="Included"
        />
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="inline-flex items-center justify-center">
        <Minus
          className="h-4 w-4 text-ink-3"
          strokeWidth={2.5}
          aria-label="Not included"
        />
      </span>
    );
  }
  return <span className="font-mono text-[13px] text-ink-2">{value}</span>;
}

export function PricingTable() {
  return (
    <section
      id="pricing"
      className="scroll-mt-14 border-b border-line bg-white/[0.01]"
    >
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
        <div className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-3">
              Pricing · Beta rates
            </span>
            <h2 className="mt-3 font-mono text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Honest pricing. Lock the beta rate before launch.
            </h2>
          </div>
          <p className="max-w-sm font-sans text-sm text-ink-2">
            Everything in the library is free during beta. Rows marked{" "}
            <span className="font-mono text-ink-3">planned</span> are not
            built yet on any tier.
          </p>
        </div>

        <div className="rounded-lg border border-line bg-surface-1">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left">
              <caption className="sr-only">
                Feature comparison across the Free, Pro and Premium plans.
              </caption>
              <colgroup>
                <col className="w-[40%]" />
                <col className="w-[20%]" />
                <col className="w-[20%]" />
                <col className="w-[20%]" />
              </colgroup>

              <thead>
                <tr>
                  <th
                    scope="col"
                    className="border-b border-line px-5 pb-4 pt-7 align-bottom"
                  >
                    <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-3">
                      Compare plans
                    </span>
                  </th>
                  {TIER_COLUMNS.map((tier) => (
                    <th
                      key={tier.key}
                      scope="col"
                      className={`relative border-b border-line px-4 pb-4 pt-7 text-center align-bottom ${tierCellTintClass(
                        tier.accent,
                      )}`}
                    >
                      {tier.badge && (
                        <span className="absolute left-1/2 top-2 -translate-x-1/2 rounded-full border border-[#00FF94]/30 bg-canvas px-2.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-brand-bright">
                          {tier.badge}
                        </span>
                      )}
                      <div
                        className={`font-mono text-xs font-bold uppercase tracking-[0.2em] ${tierNameClass(
                          tier.accent,
                        )}`}
                      >
                        {tier.name}
                      </div>
                      <div className="mt-2">
                        <span className="font-mono text-xl font-semibold text-ink">
                          {tier.price}
                        </span>
                        <span className="ml-1 font-mono text-[11px] text-ink-3">
                          {tier.cadence}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {FEATURE_ROWS.map((row, index) => {
                  const stripe =
                    index % 2 === 1 ? "bg-surface-2" : "bg-transparent";
                  return (
                    <tr key={row.label}>
                      <th
                        scope="row"
                        className={`border-b border-line px-5 py-3 text-left align-middle font-normal ${stripe}`}
                      >
                        <span className="font-mono text-[13px] text-ink-2">
                          {row.label}
                        </span>
                        {row.planned === true && (
                          <span className="ml-2 rounded-full border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-3">
                            planned
                          </span>
                        )}
                      </th>
                      {TIER_COLUMNS.map((tier) => (
                        <td
                          key={tier.key}
                          className={`border-b border-line px-4 py-3 text-center align-middle ${stripe} ${tierCellTintClass(
                            tier.accent,
                          )}`}
                        >
                          {renderCell(row[tier.key])}
                        </td>
                      ))}
                    </tr>
                  );
                })}

                <tr>
                  <td className="px-5 py-5" />
                  {TIER_COLUMNS.map((tier) => (
                    <td
                      key={tier.key}
                      className={`px-3 py-5 text-center align-top ${tierCellTintClass(
                        tier.accent,
                      )}`}
                    >
                      {tier.ctaHref === null ? (
                        <span className="inline-flex h-9 w-full cursor-default items-center justify-center rounded-md border border-line px-3 font-mono text-[12px] font-semibold text-ink-3">
                          {tier.ctaLabel}
                        </span>
                      ) : (
                        <Link
                          href={tier.ctaHref}
                          className={`inline-flex h-9 w-full items-center justify-center rounded-md px-3 font-mono text-[12px] font-semibold transition ${tierCtaClass(
                            tier.accent,
                          )}`}
                        >
                          {tier.ctaLabel}
                        </Link>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-4 font-mono text-[11px] text-ink-3">
          Planned rows are on the roadmap and are not available on any tier
          today. Paid tiers have no checkout yet.
        </p>
      </div>
    </section>
  );
}
