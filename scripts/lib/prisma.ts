/**
 * Prisma client factory shared by the CLI scripts (ingestion + maintenance).
 *
 * Scripts connect through Neon's **direct** endpoint, not the pooled one.
 * They run long, multi-statement interactive transactions (`prisma.$transaction`),
 * which are unreliable through PgBouncer transaction-mode pooling — an ingestion
 * run can span hours and would be at risk of intermittent failures.
 *
 * `DATABASE_URL` stays as a fallback so a single-URL setup still works for local
 * development.
 *
 * The running Next.js app deliberately does NOT use this helper: it goes through
 * `src/lib/prisma.ts` on the pooled `DATABASE_URL`, which is the right choice for
 * serverless invocations that open many short-lived connections.
 */
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../src/generated/prisma/client";

/** Direct endpoint first, pooled as a development fallback. */
export function resolveScriptDatabaseUrl(): string | undefined {
  return process.env.DIRECT_URL ?? process.env.DATABASE_URL;
}

/**
 * Build a PrismaClient for script use. Exits the process with a clear message
 * when neither connection variable is set — every script needs one to do
 * anything useful, so there is no sensible way to continue.
 */
export function createScriptPrismaClient(options: { readOnly?: boolean } = {}): PrismaClient {
  const connectionString = resolveScriptDatabaseUrl();
  if (!connectionString) {
    console.error(
      "Neither DIRECT_URL nor DATABASE_URL is set. Aborting.\n" +
        "Scripts prefer DIRECT_URL (Neon direct endpoint); see .env.example.",
    );
    process.exit(1);
  }
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: options.readOnly ? withReadOnlySession(connectionString) : connectionString,
    }),
  });
}

const READ_ONLY_SESSION_OPTION = "-c default_transaction_read_only=on";

/**
 * Put the read-only session flag into the URL's own `options` parameter.
 * pg merges the parsed connection string OVER the config object, so a flag
 * passed beside `connectionString` is silently dropped whenever the URL
 * already carries `options` (e.g. Neon's `options=endpoint%3D…`). Appending
 * here keeps any existing options and guarantees the flag survives.
 */
export function withReadOnlySession(connectionString: string): string {
  const url = new URL(connectionString);
  const existing = url.searchParams.get("options");
  if (existing?.includes(READ_ONLY_SESSION_OPTION)) return connectionString;
  url.searchParams.set("options", [existing, READ_ONLY_SESSION_OPTION].filter(Boolean).join(" "));
  return url.toString();
}
