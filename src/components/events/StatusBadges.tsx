import { CONSENSUS_LABELS } from "@/services/events/releaseView";
import type { TimingDisplay } from "@/services/events/timing";
import type { ConsensusStatus } from "@/types/events";

/**
 * Provenance chips.
 *
 * These are the two facts that decide how much weight a number deserves, so
 * they are rendered as first-class UI rather than as fine print. Both use the
 * same restrained treatment: green for "this can be relied on", amber for
 * "this exists but is not verified", grey for "this does not exist".
 */

const CHIP =
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]";

const TRUSTED = "border-[#00FF94]/25 bg-[#00FF94]/[0.06] text-[#00FF94]";
const CAUTION = "border-amber-300/25 bg-amber-300/[0.05] text-amber-300";
const MUTED = "border-white/10 bg-white/[0.02] text-zinc-500";

export function TimingBadge({
  display,
  title,
}: {
  display: TimingDisplay;
  title?: string;
}) {
  return (
    <span
      className={`${CHIP} ${display.tone === "trusted" ? TRUSTED : CAUTION}`}
      title={title ?? display.explanation}
    >
      <Dot trusted={display.tone === "trusted"} />
      {display.label}
    </span>
  );
}

export function ConsensusBadge({
  status,
  title,
}: {
  status: ConsensusStatus;
  title?: string;
}) {
  const className =
    status === "VERIFIED" ? TRUSTED : status === "UNVERIFIED" ? CAUTION : MUTED;
  return (
    <span className={`${CHIP} ${className}`} title={title}>
      {status !== "MISSING" && <Dot trusted={status === "VERIFIED"} />}
      {CONSENSUS_LABELS[status]}
    </span>
  );
}

export function ReactionBadge({ available }: { available: boolean }) {
  return (
    <span
      className={`${CHIP} ${available ? TRUSTED : MUTED}`}
      title={
        available
          ? "Price windows were measured against a sourced release instant."
          : "No reaction is published for this event."
      }
    >
      {available ? "Reaction measured" : "Reaction unavailable"}
    </span>
  );
}

function Dot({ trusted }: { trusted: boolean }) {
  return (
    <span
      aria-hidden
      className={`h-1 w-1 rounded-full ${
        trusted ? "bg-[#00FF94]" : "bg-amber-300"
      }`}
    />
  );
}
