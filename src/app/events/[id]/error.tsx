"use client";

import { RouteError } from "@/components/ui/RouteError";

export default function EventDetailError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <RouteError
      error={error}
      retry={unstable_retry}
      title="Could not load this event"
      description="The event query failed. The database may be unreachable or still waking from idle — Neon free-tier compute suspends when unused. Retrying usually resolves that."
    />
  );
}
