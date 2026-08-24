/**
 * A Level-1 section of a research page.
 *
 * Rewritten in the first pass from a version whose title was an 11px uppercase
 * mono label — the same treatment as a table column header and a metric caption.
 * Three hierarchy levels rendered identically means no hierarchy, and it was the
 * main reason the event page read as one continuous field of grey text.
 *
 * The mono eyebrow carries the taxonomy ("Evidence", "Method"), and the title
 * itself is a real sans heading. Eyebrow, title and description sit *above* the
 * rule and the content below it, so the rule separates the header from what it
 * introduces rather than cutting between a heading and its own description.
 *
 * ### Section identity
 *
 * The second pass added `accent` and `icon`. The event page's five sections
 * previously differed only in their wording — same grey eyebrow, same flat
 * hairline — so a reader scrolling fast had no landmark to navigate by. Now each
 * section carries a small coloured glyph and its rule fades out of that same
 * colour, which gives the page a visual rhythm without wrapping any of it in a
 * coloured card.
 *
 * The accent is chosen by what the section *is*, not to decorate it: brand
 * indigo for research and method, `pos`/`neg` only where the section genuinely
 * reports market direction. A section accent is never the sole carrier of
 * meaning — the eyebrow says the same thing in words.
 */
export type SectionAccent = "brand" | "neutral" | "pos" | "neg" | "warn";

const ACCENT: Record<SectionAccent, { text: string; rule: string }> = {
  brand: { text: "text-brand-bright", rule: "from-brand/60" },
  neutral: { text: "text-ink-3", rule: "from-line-strong" },
  pos: { text: "text-pos", rule: "from-pos/50" },
  neg: { text: "text-neg", rule: "from-neg/50" },
  warn: { text: "text-warn", rule: "from-warn/50" },
};

interface Props {
  title: string;
  /** Micro-label above the title. Taxonomy: "Release", "Evidence", "Method". */
  eyebrow?: string;
  /** Small glyph beside the eyebrow. A landmark for scrolling, not decoration. */
  icon?: React.ReactNode;
  accent?: SectionAccent;
  description?: string;
  /** Right-aligned controls or links, baseline-aligned with the title. */
  actions?: React.ReactNode;
  /** Anchor id, so the heading can label its own region. */
  id?: string;
  children: React.ReactNode;
}

export function PageSection({
  title,
  eyebrow,
  icon,
  accent = "brand",
  description,
  actions,
  id,
  children,
}: Props) {
  const headingId = id ?? undefined;
  const tone = ACCENT[accent];

  return (
    <section aria-labelledby={headingId}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          {eyebrow !== undefined && (
            <p className={`eyebrow mb-2 flex items-center gap-2 ${tone.text}`}>
              {icon !== undefined && (
                <span aria-hidden className="shrink-0">
                  {icon}
                </span>
              )}
              {eyebrow}
            </p>
          )}
          <h2 id={headingId} className="title-section">
            {title}
          </h2>
          {description !== undefined && (
            <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-ink-3">
              {description}
            </p>
          )}
        </div>
        {actions !== undefined && (
          <div className="flex shrink-0 items-center gap-3">{actions}</div>
        )}
      </div>
      {/* The rule picks up the section's accent at its left edge and fades to
          nothing, so the colour reads as an underline for the heading rather
          than as a border around the content. */}
      <div
        aria-hidden
        className={`mt-4 h-px bg-gradient-to-r ${tone.rule} via-line to-transparent`}
      />
      <div className="mt-6">{children}</div>
    </section>
  );
}
