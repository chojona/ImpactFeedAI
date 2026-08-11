/**
 * Prisma client for the running application.
 *
 * Uses `DATABASE_URL`, which points at Neon's **pooled** endpoint in production.
 * Serverless invocations open many short-lived connections, and the pooler is
 * what keeps us under Neon's connection limit.
 *
 * CLI scripts deliberately do NOT use this client — they need the direct
 * endpoint for long interactive transactions. See `scripts/lib/prisma.ts`.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Whether a connection string is present at all.
 *
 * Callers check this *before* querying so a missing variable surfaces as a
 * configuration error rather than as an empty result set. Construction itself
 * has to stay lazy and non-throwing: `next build` imports every route module to
 * collect page data, and a module-level throw would fail the build on any
 * machine without the variable set.
 */
export const isDatabaseConfigured = (): boolean =>
  typeof process.env.DATABASE_URL === "string" &&
  process.env.DATABASE_URL.length > 0;

const createClient = (): PrismaClient =>
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL ?? "",
    }),
  });

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
