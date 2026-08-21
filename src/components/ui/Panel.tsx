/**
 * The one container in the application.
 *
 * The audit found five hand-rolled variants of "bordered box" differing by a
 * hundredth of an alpha step, plus several places where a panel was used purely
 * to add a border around content that needed none. So this has two knobs and
 * both are about hierarchy rather than decoration:
 *
 *   `tone`    — how much the surface separates from the page. `flat` draws no
 *               border at all, which is the right answer more often than the
 *               previous code assumed: grouping is usually spacing's job, and
 *               a page where every element is a card has no hierarchy left.
 *   `padding` — two steps, so panel interiors line up across routes.
 *
 * Radius is fixed here on purpose. It is the single most visible source of
 * "almost consistent" in a dense UI.
 */
export type PanelTone = "flat" | "raised";
export type PanelPadding = "sm" | "md";

const TONE: Record<PanelTone, string> = {
  flat: "",
  raised: "border border-line bg-surface-1",
};

const PADDING: Record<PanelPadding, string> = {
  sm: "p-3 sm:p-4",
  md: "p-4 sm:p-5",
};

interface Props {
  tone?: PanelTone;
  padding?: PanelPadding;
  as?: "div" | "section" | "article" | "aside";
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  children: React.ReactNode;
}

export function Panel({
  tone = "raised",
  padding = "md",
  as: Tag = "div",
  className = "",
  children,
  ...aria
}: Props) {
  return (
    <Tag
      {...aria}
      className={`rounded-lg ${TONE[tone]} ${PADDING[padding]} ${className}`}
    >
      {children}
    </Tag>
  );
}

/**
 * A panel's own heading row — Level 2 in the page hierarchy, deliberately a
 * step quieter than a `SectionHeader` so a panel inside a section never
 * competes with the section it lives in.
 */
interface PanelHeaderProps {
  title: React.ReactNode;
  /** Rendered to the right, baseline-aligned. Counts, hints, controls. */
  aside?: React.ReactNode;
  id?: string;
  className?: string;
}

export function PanelHeader({
  title,
  aside,
  id,
  className = "",
}: PanelHeaderProps) {
  return (
    <div
      className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 ${className}`}
    >
      <h3 id={id} className="title-panel min-w-0">
        {title}
      </h3>
      {aside}
    </div>
  );
}
