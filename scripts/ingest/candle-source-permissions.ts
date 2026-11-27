/**
 * Source-permissions gate for historical candle preservation.
 *
 * Yahoo Finance commercial-use, automated-collection, and redistribution terms
 * are UNVERIFIED as of the candle-storage audit. Bulk live provider fetches and
 * any write path that would persist those fetches must not run until a human
 * explicitly confirms the terms have been reviewed.
 *
 * Dry-run planning against Postgres, local inventory, and coverage estimates
 * do not call the provider and remain allowed while status is `unverified`.
 */

export type CandleSourcePermissionsStatus = "unverified" | "confirmed";

/** Env var that flips the gate once terms have been reviewed. */
export const CANDLE_SOURCE_PERMISSIONS_ENV =
  "CANDLE_SOURCE_PERMISSIONS_CONFIRMED";

/**
 * Exact value required. Chosen to be long and deliberate so it cannot be set
 * accidentally by a typo or a shared "confirm=1" habit.
 */
export const CANDLE_SOURCE_PERMISSIONS_VALUE =
  "yahoo-finance2-terms-verified";

export const CANDLE_SOURCE_ID = "yahoo-finance2" as const;

export const CANDLE_SOURCE_TERMS_NOTE =
  "Yahoo Finance (yahoo-finance2) commercial use, automated collection, " +
  "and redistribution terms remain UNVERIFIED. Do not bulk-download or " +
  "redistribute candles until legal/product confirms the terms.";

export interface CandleSourceAllowedOperations {
  /** Local Postgres inventory / coverage reports. */
  localInventory: boolean;
  /** Plan remaining work units from DB + lookback math; no provider calls. */
  dryRunPlanning: boolean;
  /** Coverage / row-count estimates from pure helpers. */
  coverageEstimates: boolean;
  /** Any path that calls the live candle provider in bulk. */
  liveBulkFetch: boolean;
  /** Persist fetched candles (still also needs CANDLE_BACKFILL_CONFIRM). */
  applyWrites: boolean;
}

export interface CandleSourcePermissions {
  status: CandleSourcePermissionsStatus;
  source: typeof CANDLE_SOURCE_ID;
  termsNote: string;
  confirmationEnv: typeof CANDLE_SOURCE_PERMISSIONS_ENV;
  confirmationValue: typeof CANDLE_SOURCE_PERMISSIONS_VALUE;
  allows: CandleSourceAllowedOperations;
}

function allowsFor(
  status: CandleSourcePermissionsStatus,
): CandleSourceAllowedOperations {
  const planningAlways = {
    localInventory: true,
    dryRunPlanning: true,
    coverageEstimates: true,
  } as const;

  if (status === "confirmed") {
    return {
      ...planningAlways,
      liveBulkFetch: true,
      applyWrites: true,
    };
  }

  return {
    ...planningAlways,
    liveBulkFetch: false,
    applyWrites: false,
  };
}

/**
 * Resolve permissions from an env bag. Defaults to `process.env`.
 * Status is `confirmed` only when the env var equals the exact confirmation
 * string — any other value (including empty / missing) is `unverified`.
 */
export function resolveCandleSourcePermissions(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): CandleSourcePermissions {
  const raw = env[CANDLE_SOURCE_PERMISSIONS_ENV];
  const status: CandleSourcePermissionsStatus =
    raw === CANDLE_SOURCE_PERMISSIONS_VALUE ? "confirmed" : "unverified";

  return {
    status,
    source: CANDLE_SOURCE_ID,
    termsNote: CANDLE_SOURCE_TERMS_NOTE,
    confirmationEnv: CANDLE_SOURCE_PERMISSIONS_ENV,
    confirmationValue: CANDLE_SOURCE_PERMISSIONS_VALUE,
    allows: allowsFor(status),
  };
}

export class CandleSourcePermissionsError extends Error {
  readonly permissions: CandleSourcePermissions;
  readonly operation: "liveBulkFetch" | "applyWrites";

  constructor(
    operation: "liveBulkFetch" | "applyWrites",
    permissions: CandleSourcePermissions,
  ) {
    super(
      `Refusing ${operation}: candle source permissions are ` +
        `${permissions.status}. ${permissions.termsNote} ` +
        `Set ${permissions.confirmationEnv}=${permissions.confirmationValue} ` +
        `after terms are verified.`,
    );
    this.name = "CandleSourcePermissionsError";
    this.permissions = permissions;
    this.operation = operation;
  }
}

/** Throw unless live bulk provider fetches are allowed. */
export function assertLiveBulkFetchAllowed(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): CandleSourcePermissions {
  const permissions = resolveCandleSourcePermissions(env);
  if (!permissions.allows.liveBulkFetch) {
    throw new CandleSourcePermissionsError("liveBulkFetch", permissions);
  }
  return permissions;
}

/** Throw unless apply/write of provider-fetched candles is allowed. */
export function assertApplyWritesAllowed(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): CandleSourcePermissions {
  const permissions = resolveCandleSourcePermissions(env);
  if (!permissions.allows.applyWrites) {
    throw new CandleSourcePermissionsError("applyWrites", permissions);
  }
  return permissions;
}
