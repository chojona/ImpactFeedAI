/**
 * Minutes past midnight in America/New_York for an instant.
 *
 * `scripts/ingest/candle-semantics.ts` has an equivalent helper, but `src/`
 * must never import from `scripts/`, so the primitive is restated here rather
 * than inverting the dependency direction.
 */
const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour12: false,
  hour: "2-digit",
  minute: "2-digit",
});

export function newYorkMinuteOfDay(date: Date): number {
  const parts = formatter.formatToParts(date);
  const read = (type: "hour" | "minute"): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  // Intl can emit hour 24 for midnight under hour12:false.
  return (read("hour") % 24) * 60 + read("minute");
}
