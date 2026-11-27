import type { KnowledgeMode } from "@/types/context";

/** Shared with Agent 03 Phase 1.1 vocabulary. */
export function isKnowledgeMode(value: string): value is KnowledgeMode {
  return (
    value === "PUBLIC_INFORMATION_RECONSTRUCTION" || value === "SYSTEM_REPLAY"
  );
}
