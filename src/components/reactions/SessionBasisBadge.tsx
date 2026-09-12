/**
 * Small per-symbol disclosure of an instrument's session structure.
 *
 * Locked decision (2026-09-12): a badge on cross-instrument surfaces, not a
 * regrouping of the UI into separate sections. The chip stays terse — the
 * full meaning (US equity regular hours, extended futures session, or
 * continuous 24/7) lives in the `title` tooltip and the page's Method section,
 * never in the badge itself.
 */
import { Badge } from "@/components/ui/Badge";
import {
  SESSION_BASIS_BADGE,
  SESSION_BASIS_MEANING,
} from "@/services/market/sessionBasis";
import type { SessionBasis } from "@/types/events";

interface Props {
  sessionBasis: SessionBasis;
  className?: string;
}

export function SessionBasisBadge({ sessionBasis, className }: Props) {
  return (
    <Badge
      tone="neutral"
      size="xs"
      title={SESSION_BASIS_MEANING[sessionBasis]}
      className={className}
    >
      {SESSION_BASIS_BADGE[sessionBasis]}
    </Badge>
  );
}
