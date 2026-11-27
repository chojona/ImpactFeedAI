import { describe, expect, it } from "vitest";

import {
  CANDLE_SOURCE_PERMISSIONS_ENV,
  CANDLE_SOURCE_PERMISSIONS_VALUE,
  CandleSourcePermissionsError,
  assertApplyWritesAllowed,
  assertLiveBulkFetchAllowed,
  resolveCandleSourcePermissions,
} from "../scripts/ingest/candle-source-permissions";

describe("resolveCandleSourcePermissions", () => {
  it("defaults to unverified when the env var is missing", () => {
    const permissions = resolveCandleSourcePermissions({});
    expect(permissions.status).toBe("unverified");
    expect(permissions.allows.localInventory).toBe(true);
    expect(permissions.allows.dryRunPlanning).toBe(true);
    expect(permissions.allows.coverageEstimates).toBe(true);
    expect(permissions.allows.liveBulkFetch).toBe(false);
    expect(permissions.allows.applyWrites).toBe(false);
  });

  it("rejects near-miss confirmation values", () => {
    const permissions = resolveCandleSourcePermissions({
      [CANDLE_SOURCE_PERMISSIONS_ENV]: "true",
    });
    expect(permissions.status).toBe("unverified");
    expect(permissions.allows.liveBulkFetch).toBe(false);
  });

  it("confirms only the exact verification string", () => {
    const permissions = resolveCandleSourcePermissions({
      [CANDLE_SOURCE_PERMISSIONS_ENV]: CANDLE_SOURCE_PERMISSIONS_VALUE,
    });
    expect(permissions.status).toBe("confirmed");
    expect(permissions.allows.liveBulkFetch).toBe(true);
    expect(permissions.allows.applyWrites).toBe(true);
    expect(permissions.allows.dryRunPlanning).toBe(true);
  });
});

describe("assert gates", () => {
  it("blocks live bulk fetch while unverified", () => {
    expect(() => assertLiveBulkFetchAllowed({})).toThrow(
      CandleSourcePermissionsError,
    );
  });

  it("blocks apply writes while unverified", () => {
    expect(() => assertApplyWritesAllowed({})).toThrow(
      CandleSourcePermissionsError,
    );
  });

  it("allows both operations once confirmed", () => {
    const env = {
      [CANDLE_SOURCE_PERMISSIONS_ENV]: CANDLE_SOURCE_PERMISSIONS_VALUE,
    };
    expect(assertLiveBulkFetchAllowed(env).status).toBe("confirmed");
    expect(assertApplyWritesAllowed(env).status).toBe("confirmed");
  });
});
