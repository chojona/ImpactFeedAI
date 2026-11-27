import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createEligibilityIndex,
  createMemoryNqBarStore,
  createNqArchiveAdapter,
  loadEligibilityIndex,
  loadRollBoundaries,
  parseCsv,
  readArchiveStatus,
  readCertificationVersion,
} from "@/services/market/nqArchive";

import { ROLLS, edtSessionBars, tierA, tierB } from "./fixtures/nqArchive/helpers";

let dir = "";
const file = (name: string) => path.join(dir, name);

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "nq-archive-manifests-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const ALLOWLIST_HEADER =
  "trading_date,tier,research_eligibility,reason_code,calendar_validity," +
  "provider_integrity,contract_selection,observed_coverage,selected_contract," +
  "source_ids,certification_version";

describe("parseCsv", () => {
  it("handles CRLF line endings and a trailing newline", () => {
    expect(parseCsv("a,b\r\n1,2\r\n3,4\r\n")).toEqual([
      { a: "1", b: "2" },
      { a: "3", b: "4" },
    ]);
  });

  it("handles quoted commas, escaped quotes and quoted newlines", () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n"line1\nline2",z\n')).toEqual([
      { a: "x, y", b: 'say "hi"' },
      { a: "line1\nline2", b: "z" },
    ]);
  });

  it("keeps empty cells as empty strings", () => {
    expect(parseCsv("a,b,c\n,,\n1,,3\n")).toEqual([
      { a: "", b: "", c: "" },
      { a: "1", b: "", c: "3" },
    ]);
  });

  it("strips a UTF-8 BOM so the first header still matches", () => {
    expect(parseCsv("\uFEFFtrading_date,x\n2024-06-12,1\n")).toEqual([
      { trading_date: "2024-06-12", x: "1" },
    ]);
  });

  it("skips blank lines and returns nothing for empty input", () => {
    expect(parseCsv("a\n\n1\n\n")).toEqual([{ a: "1" }]);
    expect(parseCsv("")).toEqual([]);
  });

  it("refuses ragged rows and unterminated quotes", () => {
    expect(() => parseCsv("a,b\n1,2,3\n")).toThrow(/3 cells/);
    expect(() => parseCsv("a,b\n1\n")).toThrow(/1 cells/);
    expect(() => parseCsv('a\n"open\n')).toThrow(/unterminated/i);
  });
});

describe("loadRollBoundaries", () => {
  it("parses, drops incomplete rows and sorts by activation date", async () => {
    await writeFile(
      file("rolls.csv"),
      "from_date,to_date,old_contract,new_contract,volume_old,volume_new," +
        "paired_minute_count,artificial_cross_contract_return_used\r\n" +
        "2024-06-14,2024-06-17,NQM24,NQU24,110,220,1000,False\r\n" +
        "2024-03-15,2024-03-18,NQH24,NQM24,100,200,1000,TRUE\r\n" +
        ",2024-09-23,NQU24,NQZ24,1,2,3,false\r\n",
    );
    const rolls = await loadRollBoundaries(file("rolls.csv"));
    expect(rolls.map((r) => r.toDate)).toEqual(["2024-03-18", "2024-06-17"]);
    expect(rolls[0]!.artificialCrossContractReturnUsed).toBe(true);
    expect(rolls[1]!.artificialCrossContractReturnUsed).toBe(false);
    expect(rolls[1]!.volumeNew).toBe(220);
  });
});

describe("F4: strict qualification only from the strict allowlist", () => {
  it("refuses Tier A evidence that appears only in the exploratory allowlist", () => {
    const index = createEligibilityIndex({
      exploratoryRows: [tierA("2024-06-12")],
    });
    const row = index.lookup("2024-06-12");
    expect(row.qualification).toBe("refused");
    expect(row.reasonCode).toBe("STRICT_EVIDENCE_OUTSIDE_STRICT_ALLOWLIST");
  });

  it("refuses Tier B evidence that appears only in the strict allowlist", () => {
    const index = createEligibilityIndex({ strictRows: [tierB("2024-06-12")] });
    const row = index.lookup("2024-06-12");
    expect(row.qualification).toBe("refused");
    expect(row.reasonCode).toBe(
      "EXPLORATORY_EVIDENCE_OUTSIDE_EXPLORATORY_ALLOWLIST",
    );
  });

  it("keeps strict when both allowlists agree on a Tier A row", () => {
    const index = createEligibilityIndex({
      strictRows: [tierA("2024-06-12")],
      exploratoryRows: [tierA("2024-06-12")],
    });
    expect(index.lookup("2024-06-12").qualification).toBe("strict");
  });
});

describe("loadEligibilityIndex", () => {
  it("loads allowlists, certification contracts, calendar and expected minutes", async () => {
    await writeFile(
      file("strict.csv"),
      `${ALLOWLIST_HEADER}\n` +
        "2024-06-12,A,STRICT_AND_EXPLORATORY,A_OK,REVIEWED_REGULAR,AVAILABLE," +
        'PRIOR_VOLUME_PRESENT,FULL_ACTIVE_GRID,NQM24,"S1; S2",fixture-v9\n',
    );
    await writeFile(
      file("exploratory.csv"),
      `${ALLOWLIST_HEADER}\n` +
        "2024-06-12,A,STRICT_AND_EXPLORATORY,A_OK,,,,,NQM24,S1,fixture-v9\n" +
        "2024-06-13,B,EXPLORATORY_ONLY,B_OK,,,,,NQM24,,fixture-v9\n" +
        ",B,EXPLORATORY_ONLY,NO_DATE,,,,,NQM24,,fixture-v9\n",
    );
    await writeFile(
      file("cert.csv"),
      "trading_date,selected_contract,expected_active_minutes\n" +
        "2024-06-11,NQM24,1380\n" +
        "2024-06-12,NQM24,1380\n" +
        "2024-06-13,,\n",
    );

    const index = await loadEligibilityIndex({
      strictAllowlistCsv: file("strict.csv"),
      exploratoryAllowlistCsv: file("exploratory.csv"),
      certificationBySessionCsv: file("cert.csv"),
    });

    const strict = index.lookup("2024-06-12");
    expect(strict.qualification).toBe("strict");
    expect(strict.sourceIds).toEqual(["S1", "S2"]);
    expect(strict.calendarValidity).toBe("REVIEWED_REGULAR");
    expect(index.lookup("2024-06-13").qualification).toBe("exploratory");
    expect(index.lookup("2024-06-14").reasonCode).toBe("NOT_ON_ALLOWLIST");
    expect(index.certificationContract("2024-06-12")).toBe("NQM24");
    expect(index.certificationContract("2024-06-13")).toBeNull();
    expect(index.expectedActiveMinutes("2024-06-12")).toBe(1380);
    expect(index.expectedActiveMinutes("2024-06-13")).toBeNull();
    expect(index.tradingCalendar?.isTradingDate("2024-06-13")).toBe(true);
    expect(index.tradingCalendar?.isTradingDate("2024-06-14")).toBe(false);
  });

  it("reads the certification version without letting it gate anything", async () => {
    await writeFile(
      file("strict-version.csv"),
      `${ALLOWLIST_HEADER}\n2024-06-12,A,STRICT_AND_EXPLORATORY,,,,,,NQM24,,fixture-v9\n`,
    );
    expect(await readCertificationVersion(file("strict-version.csv"))).toBe(
      "fixture-v9",
    );
    expect(await readCertificationVersion(file("absent.csv"))).toBeNull();
    expect(await readCertificationVersion(undefined)).toBeNull();
  });

  it("refuses strict when only the exploratory allowlist is configured", async () => {
    await writeFile(
      file("exploratory-only.csv"),
      `${ALLOWLIST_HEADER}\n` +
        "2024-06-12,A,STRICT_AND_EXPLORATORY,A_OK,,,,,NQM24,S1,fixture-v9\n",
    );
    const index = await loadEligibilityIndex({
      exploratoryAllowlistCsv: file("exploratory-only.csv"),
    });
    expect(index.lookup("2024-06-12").qualification).toBe("refused");
    expect(index.tradingCalendar).toBeNull();
  });

  it("fails loudly on a malformed expected_active_minutes value", async () => {
    await writeFile(
      file("cert-bad.csv"),
      "trading_date,selected_contract,expected_active_minutes\n" +
        "2024-06-12,NQM24,lots\n",
    );
    await expect(
      loadEligibilityIndex({ certificationBySessionCsv: file("cert-bad.csv") }),
    ).rejects.toThrow(/expected_active_minutes/);
  });
});

describe("F4: archive acceptance/certification artifacts gate qualification", () => {
  it("reports explicit reasons for missing, unparseable and status-less reports", async () => {
    await writeFile(file("broken.json"), "{not json");
    await writeFile(file("array.json"), "[1,2]");
    await writeFile(file("no-status.json"), '{"verdict":"PASS"}');
    await writeFile(file("ok.json"), '{"status":"FIXTURE_STATUS"}');

    expect(await readArchiveStatus(undefined, "ACCEPTANCE_REPORT")).toEqual({
      status: null,
      refusalReason: "ACCEPTANCE_REPORT_NOT_CONFIGURED",
    });
    expect(
      (await readArchiveStatus(file("absent.json"), "ACCEPTANCE_REPORT"))
        .refusalReason,
    ).toBe("ACCEPTANCE_REPORT_MISSING");
    expect(
      (await readArchiveStatus(dir, "ACCEPTANCE_REPORT")).refusalReason,
    ).toBe("ACCEPTANCE_REPORT_UNREADABLE");
    expect(
      (await readArchiveStatus(file("broken.json"), "CERTIFICATION_REPORT"))
        .refusalReason,
    ).toBe("CERTIFICATION_REPORT_UNPARSEABLE");
    expect(
      (await readArchiveStatus(file("array.json"), "CERTIFICATION_REPORT"))
        .refusalReason,
    ).toBe("CERTIFICATION_REPORT_UNPARSEABLE");
    expect(
      (await readArchiveStatus(file("no-status.json"), "CERTIFICATION_REPORT"))
        .refusalReason,
    ).toBe("CERTIFICATION_REPORT_STATUS_MISSING");
    expect(
      await readArchiveStatus(file("ok.json"), "CERTIFICATION_REPORT"),
    ).toEqual({ status: "FIXTURE_STATUS", refusalReason: null });
  });

  const adapterWith = (reports: {
    acceptanceReportJson?: string;
    certificationReportJson?: string;
  }) =>
    createNqArchiveAdapter({
      env: {},
      paths: {
        outrightParquet: file("unused.parquet"),
        rollsCsv: file("unused-rolls.csv"),
        ...reports,
      },
      rolls: ROLLS,
      eligibility: createEligibilityIndex({ strictRows: [tierA("2024-06-12")] }),
      barStore: createMemoryNqBarStore(
        edtSessionBars({
          contract: "NQM24",
          startIso: "2024-06-12T12:29:00.000Z",
          endIso: "2024-06-12T12:31:00.000Z",
        }),
      ),
    });

  const request = {
    releaseAt: new Date("2024-06-12T12:30:00.000Z"),
    beforeMs: 60_000,
    afterMs: 60_000,
  };

  it("refuses a strict session when the reports are missing or broken", async () => {
    await writeFile(file("acceptance.json"), '{"status":"FIXTURE_ACCEPT"}');
    await writeFile(file("certification.json"), "{");

    const missing = await adapterWith({});
    expect(missing.provenance.artifactRefusalReasons).toEqual([
      "ACCEPTANCE_REPORT_NOT_CONFIGURED",
      "CERTIFICATION_REPORT_NOT_CONFIGURED",
    ]);
    const missingResult = await missing.extractEventWindow(request);
    expect(missingResult.reactionQualification).toBe("refused");
    expect(missingResult.eligibility.reasonCode).toBe(
      "ACCEPTANCE_REPORT_NOT_CONFIGURED",
    );

    const broken = await adapterWith({
      acceptanceReportJson: file("acceptance.json"),
      certificationReportJson: file("certification.json"),
    });
    expect(broken.provenance.acceptanceStatus).toBe("FIXTURE_ACCEPT");
    const brokenResult = await broken.extractEventWindow(request);
    expect(brokenResult.reactionQualification).toBe("refused");
    expect(brokenResult.refusalReasons).toEqual([
      "CERTIFICATION_REPORT_UNPARSEABLE",
    ]);
  });

  it("allows strict once both reports carry a status", async () => {
    await writeFile(file("acceptance.json"), '{"status":"FIXTURE_ACCEPT"}');
    await writeFile(file("certification-ok.json"), '{"status":"FIXTURE_CERT"}');
    const adapter = await adapterWith({
      acceptanceReportJson: file("acceptance.json"),
      certificationReportJson: file("certification-ok.json"),
    });
    expect(adapter.provenance.artifactRefusalReasons).toEqual([]);
    expect(adapter.provenance.certificationStatus).toBe("FIXTURE_CERT");
    const result = await adapter.extractEventWindow(request);
    expect(result.reactionQualification).toBe("strict");
  });
});
