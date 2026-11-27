/**
 * Shown only when the reader changes filter, sort or search. The first page
 * arrives from the server already rendered, so this is no longer what a visitor
 * meets on arrival.
 */
export function EventBrowserSkeleton() {
  return (
    <div
      className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 xl:grid-cols-3"
      aria-hidden
    >
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className="surface-lift flex flex-col gap-3 rounded-lg border border-line bg-surface-1 p-4 sm:p-[18px]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="h-4 w-16 animate-pulse rounded bg-white/[0.05]" />
            <div className="space-y-1.5">
              <div className="h-2.5 w-20 animate-pulse rounded bg-white/[0.05]" />
              <div className="ml-auto h-2 w-14 animate-pulse rounded bg-white/[0.03]" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="h-3.5 w-full animate-pulse rounded bg-white/[0.05]" />
            <div className="h-3.5 w-3/5 animate-pulse rounded bg-white/[0.05]" />
          </div>
          <div className="space-y-2 rounded-md border border-line bg-surface-2 px-3 py-2.5">
            <div className="h-3 w-2/5 animate-pulse rounded bg-white/[0.06]" />
            <div className="h-1.5 w-full animate-pulse rounded-full bg-white/[0.04]" />
            <div className="h-1.5 w-full animate-pulse rounded-full bg-white/[0.04]" />
          </div>
        </div>
      ))}
    </div>
  );
}
