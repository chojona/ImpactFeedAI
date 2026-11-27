import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertMeasurementWriteAllowed,
  evaluateComputedMeasurementWrite,
  evaluateMeasurementWrite,
  MEASUREMENT_CUTOVER_AUTHORIZATIONS,
  MeasurementWriteFrozenError,
  type MeasurementCutoverAuthorization,
} from "@/services/events/measurementWriteGate";
import {
  COMPUTED_REACTION_CALCULATION_VERSION,
  CURRENT_REACTION_CALCULATION_VERSION,
} from "@/services/events/timing";

const BACKFILL = "scripts/backfill/backfill-reaction-measurements.ts";

const complete: MeasurementCutoverAuthorization = {
  version: 4,
  qualificationEvidence: "docs/audits/example/cutover-qualification.json",
  authorizedBy: "maintainer",
  authorizedOn: "2027-01-15",
};

describe("measurement write gate", () => {
  it("keeps production reads on v3 while the engine computes v4", () => {
    expect(CURRENT_REACTION_CALCULATION_VERSION).toBe(3);
    expect(COMPUTED_REACTION_CALCULATION_VERSION).toBe(4);
  });

  it("commits no cutover authorization while Phase 0.5 is NO-GO", () => {
    expect(MEASUREMENT_CUTOVER_AUTHORIZATIONS.some((a) => a.version === 4)).toBe(false);
  });

  it("freezes writes of the computed v4 version by default", () => {
    const decision = evaluateComputedMeasurementWrite();
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toMatch(/v4 write freeze/);
    expect(() => assertMeasurementWriteAllowed(4)).toThrow(MeasurementWriteFrozenError);
  });

  it("allows the live read version", () => {
    expect(evaluateMeasurementWrite({ version: 3 })).toEqual({ allowed: true, version: 3, basis: "live_read_version" });
  });

  it("releases v4 only with a complete committed authorization", () => {
    expect(evaluateMeasurementWrite({ version: 4, authorizations: [complete] })).toEqual({
      allowed: true, version: 4, basis: "authorized_cutover",
    });
    expect(evaluateMeasurementWrite({ version: 5, authorizations: [complete] }).allowed).toBe(false);
  });

  it.each([
    { qualificationEvidence: " " },
    { authorizedBy: "" },
    { authorizedOn: "next week" },
    { authorizedOn: "2027-13-45" },
  ])("refuses an incomplete authorization %o", (patch) => {
    const decision = evaluateMeasurementWrite({ version: 4, authorizations: [{ ...complete, ...patch }] });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toMatch(/incomplete/);
  });

  it.each([0, -1, 3.5, Number.NaN])("refuses invalid version %s", (version) => {
    expect(evaluateMeasurementWrite({ version }).allowed).toBe(false);
  });
});

describe("backfill-reaction-measurements --apply under the write freeze", () => {
  const run = (args: string[], env: Record<string, string>) =>
    spawnSync(process.execPath, ["--import", "tsx", BACKFILL, ...args], {
      cwd: resolve(__dirname, ".."),
      // Unroutable placeholder: the gate must refuse before any connection.
      env: { ...process.env, DIRECT_URL: "postgresql://u:p@127.0.0.1:1/none", ...env },
      encoding: "utf8",
      timeout: 60_000,
    });

  it("refuses even with the confirmation variable, before creating a client", () => {
    const result = run(["--apply"], { REACTION_MEASUREMENT_BACKFILL_CONFIRM: "WRITE_MEASUREMENTS" });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/v4 write freeze/);
    expect(result.stderr).toMatch(/Dry-runs remain available/);
    expect(result.stdout).not.toMatch(/APPLY — writing/);
  }, 60_000);

  it("refuses --apply combined with event scoping", () => {
    const result = run(["--apply", "--event-id", "00000000-0000-0000-0000-000000000000"], {
      REACTION_MEASUREMENT_BACKFILL_CONFIRM: "WRITE_MEASUREMENTS",
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/write freeze/);
  }, 60_000);

  it("documents the freeze in --help", () => {
    const result = run(["--help"], {});
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/--apply is refused/);
  }, 60_000);

  it("re-checks the gate immediately before the only write call", () => {
    const source = readFileSync(resolve(__dirname, "..", BACKFILL), "utf8");
    const guard = source.indexOf("assertMeasurementWriteAllowed(COMPUTED_REACTION_CALCULATION_VERSION)");
    const write = source.indexOf("prisma.reactionMeasurement.createMany(");
    expect(guard).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(guard);
    expect(source.indexOf("prisma.reactionMeasurement.createMany(", write + 1)).toBe(-1);
  });
});
