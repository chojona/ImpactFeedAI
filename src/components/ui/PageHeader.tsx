/**
 * The top of a research route: what this page is, in one line, plus the figures
 * that describe the dataset behind it.
 *
 * The previous feed and pattern headers each opened with a four-line paragraph
 * of methodology at full body size — Level-3 content in the single most
 * prominent position on the page. The lede here is capped at two sentences and
 * set quieter than the title, and the counts that a researcher actually scans
 * for ("how much is in here, how much of it is usable") are promoted out of the
 * prose into a metric strip.
 */
interface Props {
  title: string;
  eyebrow?: string;
  lede?: React.ReactNode;
  /** Metric strip, filters, or anything that describes the dataset. */
  aside?: React.ReactNode;
  children?: React.ReactNode;
}

export function PageHeader({ title, eyebrow, lede, aside, children }: Props) {
  return (
    <header>
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-6">
        <div className="min-w-0 max-w-2xl">
          {eyebrow !== undefined && <p className="eyebrow mb-3">{eyebrow}</p>}
          <h1 className="title-page">{title}</h1>
          {lede !== undefined && (
            <p className="mt-3 text-[15px] leading-relaxed text-ink-3">
              {lede}
            </p>
          )}
        </div>
        {aside}
      </div>
      {children}
    </header>
  );
}
