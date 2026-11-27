import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseAlfredObservationsPayload } from "@/services/context/alfred";
import { CONTEXT_SERIES } from "@/services/context/definitions";
import {
  assertVintageHomogeneousPanel,
  vintageConsistentMom,
  vintageConsistentQoqSaar,
  vintageConsistentYoy,
} from "@/services/context/transforms";
import type { ContextObservation } from "@/types/context";
import gdpVintages from "./fixtures/alfred/gdpc1-q1-2023-vintages.json";

const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/alfred",
);
const load = (name: string): string =>
  readFileSync(join(fixtureDir, name), "utf8");

const fetchedAt = new Date("2026-11-27T15:00:00.000Z");

function parse(
  file: string,
  seriesId: string,
  mode: "as_of_vintage" | "current_latest" | "initial_release_only",
  seriesKey: string,
  unit: string,
): ContextObservation[] {
  return parseAlfredObservationsPayload(load(file), {
    seriesId,
    mode,
    fetchedAt,
    sourceUrlRedacted: "https://api.stlouisfed.org/fred/series/observations",
    seriesKey,
    unit,
  });
}

function gdpSnapshot(date: keyof typeof gdpVintages) {
  return parseAlfredObservationsPayload(JSON.stringify(gdpVintages[date]), {
    seriesId: "GDPC1",
    mode: "as_of_vintage",
    vintageDate: date,
    fetchedAt,
    sourceUrlRedacted: "https://api.stlouisfed.org/fred/series/observations",
  });
}

describe("vintage-consistent transforms", () => {
  it("rejects an April GDP numerator with a June snapshot denominator", () => {
    const april = gdpSnapshot("2023-04-27");
    const june = gdpSnapshot("2023-06-29");

    expect(vintageConsistentQoqSaar([june[0], april[1]], 1)).toMatchObject({
      status: "missing",
      reason: "mixed_vintage_panel",
    });
  });

  it("A2: first-print PAYEMS MoM is +517; current panel is +434", () => {
    const firstPrint = parse(
      "payems-asof-2023-02-03.json",
      "PAYEMS",
      "as_of_vintage",
      CONTEXT_SERIES.PAYEMS.seriesKey,
      CONTEXT_SERIES.PAYEMS.unit,
    );
    const current = parse(
      "payems-current-jan2023-panel.json",
      "PAYEMS",
      "current_latest",
      CONTEXT_SERIES.PAYEMS.seriesKey,
      CONTEXT_SERIES.PAYEMS.unit,
    );

    const firstMom = vintageConsistentMom(firstPrint, 2);
    const currentMom = vintageConsistentMom(current, 2);
    expect(firstMom).toMatchObject({ status: "ok", value: 517 });
    expect(currentMom).toMatchObject({ status: "ok", value: 434 });
    expect(firstMom).toMatchObject({
      prior: 260,
      inputs: [
        { role: "numerator", observationId: firstPrint[2].id },
        { role: "denominator", observationId: firstPrint[1].id },
        { role: "prior_numerator", observationId: firstPrint[1].id },
        { role: "prior_denominator", observationId: firstPrint[0].id },
      ],
    });
    expect(vintageConsistentMom([current[0], firstPrint[1], firstPrint[2]], 2))
      .toMatchObject({ status: "missing", reason: "mixed_vintage_panel" });
  });

  it("A3: mixed first-print Jan with current Dec is rejected", () => {
    const firstPrint = parse(
      "payems-asof-2023-02-03.json",
      "PAYEMS",
      "as_of_vintage",
      CONTEXT_SERIES.PAYEMS.seriesKey,
      CONTEXT_SERIES.PAYEMS.unit,
    );
    const current = parse(
      "payems-current-jan2023-panel.json",
      "PAYEMS",
      "current_latest",
      CONTEXT_SERIES.PAYEMS.seriesKey,
      CONTEXT_SERIES.PAYEMS.unit,
    );
    const mixed = [current[1], firstPrint[2]];
    expect(assertVintageHomogeneousPanel(mixed)).toEqual({
      ok: false,
      reason: "mixed_vintage_panel",
    });
    const result = vintageConsistentMom(mixed, 1);
    expect(result.status).toBe("missing");
    if (result.status === "missing") {
      expect(result.reason).toBe("mixed_vintage_panel");
    }
    // Document the false arithmetic the guard prevents.
    expect(155073 - 154342).toBe(731);
  });

  it("C1: YoY uses the same vintage panel for numerator and year-ago", () => {
    const levels = parse(
      "cpiaucns-yoy-panel-2022-07-13.json",
      "CPIAUCNS",
      "as_of_vintage",
      CONTEXT_SERIES.CPIAUCNS.seriesKey,
      CONTEXT_SERIES.CPIAUCNS.unit,
    );
    // deriveMetric yoy needs index and index-12; pad null holes.
    const panel: Array<ContextObservation | null> = Array.from(
      { length: 13 },
      () => null,
    );
    panel[0] = levels[0];
    panel[12] = levels[1];
    const yoy = vintageConsistentYoy(panel, 12);
    expect(yoy.status).toBe("ok");
    if (yoy.status === "ok") {
      expect(yoy.value).toBe(9.1);
      expect(yoy.inputs).toHaveLength(2);
      expect(yoy.inputs[0].vintageKey).toContain("2022-07-13");
      expect(yoy.inputs[1].vintageKey).toContain("2022-07-13");
    }
  });

  it("A6: GDPC1 Q1 2023 advance/second/third SAAR differ by vintage", () => {
    const saarFor = (vintageDate: keyof typeof gdpVintages): number => {
      const result = vintageConsistentQoqSaar(gdpSnapshot(vintageDate), 1);
      expect(result.status).toBe("ok");
      if (result.status !== "ok") throw new Error("expected ok");
      return result.value;
    };

    const advance = saarFor("2023-04-27");
    const second = saarFor("2023-05-25");
    const third = saarFor("2023-06-29");
    expect(advance).toBe(1.1);
    expect(second).toBe(1.3);
    expect(third).toBe(2.0);
    expect(new Set([advance, second, third]).size).toBe(3);
  });

  it("C2: insufficient panel yields missing, not zero", () => {
    const result = vintageConsistentMom([null, null], 1);
    expect(result).toEqual({
      status: "missing",
      reason: "insufficient_vintage_panel",
      inputs: [],
    });
  });
});
