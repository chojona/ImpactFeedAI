/**
 * The one container in the application.
 *
 * The audit found five hand-rolled variants of "bordered box" differing by a
 * hundredth of an alpha step, plus several places where a panel was used purely
 * to add a border around content that needed none. So this has two knobs and
 * both are about hierarchy rather than decoration:
 *
 *   `tone`    — how much the surface separates from the page, and whether it
 *               carries a meaning. `flat` draws no border at all, which is the
 *               right answer more often than the previous code assumed:
 *               grouping is usually spacing's job, and a page where every
 *               element is a card has no hierarchy left.
 *   `padding` — two steps, so panel interiors line up across routes.
 *
 * ### Where the depth comes from
 *
 * Every non-flat tone gets `surface-lift`: a top-edge light gradient plus a 1px
 * inset highlight. On a dark interface that reads as a bevel where a drop
 * shadow reads as nothing, and it is what separates a panel from the page now
 * that both are navy rather than both being near-black.
 *
 * `brand` is the informational tone. It exists so a research aside or a
 * methodology block can say "this is the application talking, not a market
 * reading" in indigo — the one hue in the system that carries no market
 * meaning.
 *
 * Radius is fixed here on purpose. It is the single most visible source of
 * "almost consistent" in a dense UI.
 */
export type PanelTone = "flat" | "raised" | "elevated" | "brand";
export type PanelPadding = "sm" | "md";

const TONE: Record<PanelTone, string> = {
  flat: "",
  raised: "surface-lift border border-line bg-surface-1",
  elevated: "surface-lift border border-line-strong bg-surface-2",
  brand: "surface-lift border border-brand/25 bg-brand-tint",
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
 * step quieter than a `PageSection` header so a panel inside a section never
 * competes with the section it lives in.
 *
 * `icon` is optional and unstyled beyond its colour: a panel that is one of
 * several similar panels benefits from a glyph the eye can target, and one that
 * stands alone does not need it.
 */
interface PanelHeaderProps {
  title: React.ReactNode;
  /** Rendered to the right, baseline-aligned. Counts, hints, controls. */
  aside?: React.ReactNode;
  icon?: React.ReactNode;
  id?: string;
  className?: string;
}

export function PanelHeader({
  title,
  aside,
  icon,
  id,
  className = "",
}: PanelHeaderProps) {
  return (
    <div
      className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 ${className}`}
    >
      <h3 id={id} className="title-panel flex min-w-0 items-center gap-2">
        {icon !== undefined && (
          <span className="shrink-0 text-brand-bright" aria-hidden>
            {icon}
          </span>
        )}
        {title}
      </h3>
      {aside}
    </div>
  );
}
