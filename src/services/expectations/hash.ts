import { createHash } from "node:crypto";

/** Stable content hash for fixture/payload identity (no secrets). */
export function sha256Hex(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}
