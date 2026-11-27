/**
 * Session eligibility from Phase-3 allowlists and certification-by-session.
 *
 * Does not bypass calendar certification: Tier A → strict, Tier B → exploratory
 * only, everything else → refused for qualified reactions.
 */
import { readFile } from "node:fs/promises";

import { readCsvRecords } from "./csv";
import type {
  NqReactionQualification,
  NqResearchTier,
  NqSessionEligibility,
} from "./types";

export interface NqEligibilityIndex {
  lookup(tradingDate: string): NqSessionEligibility;
  certificationContract(tradingDate: string): string | null;
}

interface AllowlistRow {
  tradingDate: string;
  tier: NqResearchTier;
  researchEligibility: string;
  reasonCode: string;
  calendarValidity: string;
  providerIntegrity: string;
  contractSelection: string;
  observedCoverage: string;
  selectedContract: string;
  sourceIds: string[];
}

const asTier = (value: string): NqResearchTier => {
  if (value === "A" || value === "B" || value === "C" || value === "D") {
    return value;
  }
  return "UNKNOWN";
};

const qualificationFor = (
  tier: NqResearchTier,
  researchEligibility: string | null,
): NqReactionQualification => {
  if (tier === "A" || researchEligibility === "STRICT_AND_EXPLORATORY") {
    return "strict";
  }
  if (tier === "B" || researchEligibility === "EXPLORATORY_ONLY") {
    return "exploratory";
  }
  return "refused";
};

const parseAllowlist = (
  rows: ReadonlyArray<Readonly<Record<string, string>>>,
): Map<string, AllowlistRow> => {
  const map = new Map<string, AllowlistRow>();
  for (const row of rows) {
    const tradingDate = row.trading_date ?? "";
    if (!tradingDate) continue;
    map.set(tradingDate, {
      tradingDate,
      tier: asTier(row.tier ?? ""),
      researchEligibility: row.research_eligibility ?? "",
      reasonCode: row.reason_code ?? "",
      calendarValidity: row.calendar_validity ?? "",
      providerIntegrity: row.provider_integrity ?? "",
      contractSelection: row.contract_selection ?? "",
      observedCoverage: row.observed_coverage ?? "",
      selectedContract: row.selected_contract ?? "",
      sourceIds: (row.source_ids ?? "")
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean),
    });
  }
  return map;
};

export async function loadEligibilityIndex(args: {
  strictAllowlistCsv?: string;
  exploratoryAllowlistCsv?: string;
  certificationBySessionCsv?: string;
}): Promise<NqEligibilityIndex> {
  const strict = args.strictAllowlistCsv
    ? parseAllowlist(await readCsvRecords(args.strictAllowlistCsv))
    : new Map<string, AllowlistRow>();
  const exploratory = args.exploratoryAllowlistCsv
    ? parseAllowlist(await readCsvRecords(args.exploratoryAllowlistCsv))
    : new Map<string, AllowlistRow>();

  const certificationContracts = new Map<string, string>();
  if (args.certificationBySessionCsv) {
    const rows = await readCsvRecords(args.certificationBySessionCsv);
    for (const row of rows) {
      const date = row.trading_date ?? "";
      const contract = row.selected_contract ?? "";
      if (date && contract) certificationContracts.set(date, contract);
    }
  }

  return {
    certificationContract(tradingDate: string): string | null {
      return certificationContracts.get(tradingDate) ?? null;
    },
    lookup(tradingDate: string): NqSessionEligibility {
      const row = strict.get(tradingDate) ?? exploratory.get(tradingDate);
      if (!row) {
        return {
          tradingDate,
          tier: "UNKNOWN",
          researchEligibility: null,
          reasonCode: "NOT_ON_ALLOWLIST",
          calendarValidity: null,
          providerIntegrity: null,
          contractSelectionEvidence: null,
          observedCoverage: null,
          selectedContract: certificationContracts.get(tradingDate) ?? null,
          sourceIds: [],
          qualification: "refused",
        };
      }

      return {
        tradingDate,
        tier: row.tier,
        researchEligibility: row.researchEligibility || null,
        reasonCode: row.reasonCode || null,
        calendarValidity: row.calendarValidity || null,
        providerIntegrity: row.providerIntegrity || null,
        contractSelectionEvidence: row.contractSelection || null,
        observedCoverage: row.observedCoverage || null,
        selectedContract: row.selectedContract || null,
        sourceIds: row.sourceIds,
        qualification: qualificationFor(row.tier, row.researchEligibility),
      };
    },
  };
}

export async function readJsonStatus(
  filePath: string | undefined,
  key: "status",
): Promise<string | null> {
  if (!filePath) return null;
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const value = parsed[key];
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

export async function readCertificationVersion(
  strictAllowlistCsv: string | undefined,
): Promise<string | null> {
  if (!strictAllowlistCsv) return null;
  try {
    const rows = await readCsvRecords(strictAllowlistCsv);
    return rows[0]?.certification_version ?? null;
  } catch {
    return null;
  }
}
