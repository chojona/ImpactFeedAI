import { DataStatePanel } from "@/components/ui/DataStatePanel";

/**
 * "No matches" and "nothing ingested yet" are different problems with different
 * fixes, so they get different copy rather than one ambiguous message.
 *
 * `hasLibrary` must come from the unfiltered library total — never from
 * query-faceted `counts.ALL`, which is zero for a search that matches nothing.
 */
export function EventBrowserEmptyState({
  hasLibrary,
}: {
  hasLibrary: boolean;
}) {
  if (hasLibrary) {
    return (
      <DataStatePanel
        state="unavailable"
        title="No events match this search"
        footnote="The library itself is not empty — only this combination of query and category is."
      >
        Try clearing the category filter or searching for a metric name such as
        CPI, payrolls or the federal funds rate.
      </DataStatePanel>
    );
  }
  return (
    <DataStatePanel
      state="pending"
      title="The event library is empty"
      footnote={
        <>
          Load it with{" "}
          <code className="num text-ink-2">npm run ingest</code> for the curated
          events, or{" "}
          <code className="num text-ink-2">
            npm run auto-ingest -- --no-prices
          </code>{" "}
          for the bulk macro history.
        </>
      }
    >
      Nothing has been ingested into this database yet, so there is nothing to
      search or filter.
    </DataStatePanel>
  );
}
