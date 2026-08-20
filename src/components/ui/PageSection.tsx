/**
 * A titled section with a rule, used to structure the research pages.
 *
 * Extracted because the same heading treatment was being re-declared inside
 * each route file, which is how two pages end up with headings that are almost
 * the same size.
 */
interface Props {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function PageSection({ title, description, actions, children }: Props) {
  return (
    <section>
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
            {title}
          </h2>
          {description !== undefined && (
            <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-zinc-500">
              {description}
            </p>
          )}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
