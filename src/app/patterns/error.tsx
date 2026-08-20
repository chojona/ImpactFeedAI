"use client";

import { RouteError } from "@/components/ui/RouteError";

export default function PatternsError({
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
      title="Could not compute the pattern library"
      description="The coverage and reaction aggregates could not be read from Postgres. This is a database or connection failure, not an empty library — an empty library renders its own state."
    />
  );
}
