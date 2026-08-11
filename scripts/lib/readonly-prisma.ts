/**
 * Read-only Prisma client for dry-runs.
 *
 * A dry-run should mean "read the database, read the external APIs, write
 * nothing" — not "pretend the database does not exist". The old behaviour
 * passed `null` instead of a client, which disabled writes but also disabled
 * the deduplication check, so the most failure-prone logic in the pipeline was
 * never exercised by a dry-run.
 *
 * The guarantee here is enforced by a Prisma client extension rather than by
 * convention: every model operation passes through `$allOperations`, and any
 * operation in `WRITE_OPERATIONS` throws before reaching the database. There
 * is no code path a caller can take to write through this client — calling
 * `prisma.event.create(...)` raises `DryRunWriteError` instead of inserting.
 */
import type { PrismaClient } from "../../src/generated/prisma/client";
import { createScriptPrismaClient } from "./prisma";

export class DryRunWriteError extends Error {
  constructor(model: string, operation: string) {
    super(
      `[dry-run] blocked a database write: ${model}.${operation}(). ` +
        `Dry-runs may read but never mutate. This is a bug in the caller — ` +
        `it should branch on the dry-run flag before attempting to write.`,
    );
    this.name = "DryRunWriteError";
  }
}

/**
 * Every Prisma model operation that mutates. Anything not listed is a read.
 * Kept as an explicit allowlist-by-exclusion so a future Prisma version adding
 * a new write verb fails loudly in review rather than silently slipping past.
 */
const WRITE_OPERATIONS: ReadonlySet<string> = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
]);

/**
 * Build a client that can read Neon but cannot write to it.
 *
 * Note on raw queries: `$executeRaw` / `$executeRawUnsafe` are client-level
 * operations, not model operations, so they are not intercepted here. No
 * ingestion code uses them; if that changes, they must be blocked too.
 */
export function createDryRunPrismaClient(): PrismaClient {
  const base = createScriptPrismaClient();

  return guardPrismaClient(base);
}

/** Wrap an explicitly constructed client (for example, a repair-only URL). */
export function guardPrismaClient(base: PrismaClient): PrismaClient {

  const guarded = base.$extends({
    name: "dry-run-write-guard",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (WRITE_OPERATIONS.has(operation)) {
            throw new DryRunWriteError(model ?? "unknown", operation);
          }
          return query(args);
        },
      },
    },
  });

  // The extension narrows the client's type; the surface the scripts use
  // (findUnique / findFirst / count / $transaction / $disconnect) is identical.
  return guarded as unknown as PrismaClient;
}
