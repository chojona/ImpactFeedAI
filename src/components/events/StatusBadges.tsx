import { Badge } from "@/components/ui/Badge";
import { CONSENSUS_LABELS } from "@/services/events/releaseView";
import type { TimingDisplay } from "@/services/events/timing";
import type { ConsensusStatus } from "@/types/events";

/**
 * Provenance chips.
 *
 * These are the two facts that decide how much weight a number deserves, so
 * they are rendered as first-class UI rather than as fine print. Both now go
 * through the shared `Badge` primitive: they used to carry their own padding,
 * radius and letter-spacing, which is how the same chip ended up a different
 * size on the feed than on a detail page.
 *
 * Green for "this can be relied on", amber for "this exists but is not
 * verified", grey for "this does not exist" — and each one always ships its
 * word, never a bare colour.
 */

export function TimingBadge({
  display,
  title,
  size = "sm",
}: {
  display: TimingDisplay;
  title?: string;
  size?: "xs" | "sm";
}) {
  const trusted = display.tone === "trusted";
  return (
    <Badge
      tone={trusted ? "positive" : "caution"}
      size={size}
      dot
      title={title ?? display.explanation}
    >
      {display.label}
    </Badge>
  );
}

export function ConsensusBadge({
  status,
  title,
  size = "sm",
}: {
  status: ConsensusStatus;
  title?: string;
  size?: "xs" | "sm";
}) {
  return (
    <Badge
      tone={
        status === "VERIFIED"
          ? "positive"
          : status === "UNVERIFIED"
            ? "caution"
            : "neutral"
      }
      size={size}
      dot={status !== "MISSING"}
      title={title}
    >
      {CONSENSUS_LABELS[status]}
    </Badge>
  );
}

/**
 * Whether this event publishes a reaction, and if not, which kind of "not".
 *
 * "Withheld" and "not measured" were previously one label — "Reaction
 * unavailable" — which conflated a deliberate refusal (the timing provenance
 * does not clear the bar) with a queued backfill. They are the difference
 * between a policy and a to-do, and the reader can act on only one of them.
 */
export function ReactionBadge({
  available,
  /** False when the release timing cannot anchor a measurement at all. */
  eligible = true,
  size = "sm",
}: {
  available: boolean;
  eligible?: boolean;
  size?: "xs" | "sm";
}) {
  if (available) {
    return (
      <Badge
        tone="positive"
        size={size}
        dot
        title="Price windows were measured against a sourced release instant."
      >
        Reaction measured
      </Badge>
    );
  }
  return (
    <Badge
      tone={eligible ? "info" : "caution"}
      size={size}
      dot
      title={
        eligible
          ? "The release instant is sourced, but no price window has been stored yet."
          : "The release timing does not meet the provenance bar, so no reaction is published."
      }
    >
      {eligible ? "Reaction not measured" : "Reaction withheld"}
    </Badge>
  );
}
