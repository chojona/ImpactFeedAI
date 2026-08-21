/**
 * A Level-1 section of a research page.
 *
 * Rewritten from a version whose title was an 11px uppercase mono label — the
 * same treatment as a table column header and a metric caption. Three
 * hierarchy levels rendered identically means no hierarchy, and it was the main
 * reason the event page read as one continuous field of grey text.
 *
 * Now: an optional mono eyebrow carries the taxonomy ("03 · Evidence" style
 * ordering, when a route wants it), and the title itself is a real sans
 * heading. Eyebrow, title and description sit *above* the hairline rule and the
 * content below it, so the rule separates the header from what it introduces
 * rather than cutting between a heading and its own description. The rule also
 * replaces the border a card would have drawn — grouping by a line and
 * whitespace rather than by boxing everything, per §7.
 */
interface Props {
  title: string;
  /** Micro-label above the title. Ordering, taxonomy, or a section number. */
  eyebrow?: string;
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
  description,
  actions,
  id,
  children,
}: Props) {
  const headingId = id ?? undefined;
  return (
    <section aria-labelledby={headingId}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-line pb-4">
        <div className="min-w-0">
          {eyebrow !== undefined && <p className="eyebrow mb-2">{eyebrow}</p>}
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
      <div className="mt-6">{children}</div>
    </section>
  );
}
