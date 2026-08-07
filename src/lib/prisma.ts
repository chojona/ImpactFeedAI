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
