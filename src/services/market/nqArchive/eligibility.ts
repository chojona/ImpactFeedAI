/**
 * Session eligibility from Phase-3 allowlists and certification-by-session.
 *
 * Strict qualification requires Tier A **and** `STRICT_AND_EXPLORATORY`.
 * Exploratory requires Tier B **and** `EXPLORATORY_ONLY`. Conflicting
 * tier/eligibility pairs refuse rather than promoting via OR.
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

export interface AllowlistRow {
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

/**
 * Map allowlist evidence to a reaction qualification.
 *
 * Never promotes with OR across tier and researchEligibility. A mismatched
 * pair (for example Tier A with EXPLORATORY_ONLY) is refused.
 */
export function qualificationFromEvidence(
  tier: NqResearchTier,
  researchEligibility: string | null,
): NqReactionQualification {
  const eligibility = researchEligibility ?? "";
  if (tier === "A" && eligibility === "STRICT_AND_EXPLORATORY") {
    return "strict";
  }
  if (tier === "B" && eligibility === "EXPLORATORY_ONLY") {
    return "exploratory";
  }
  return "refused";
}

const rowsAgree = (a: AllowlistRow, b: AllowlistRow): boolean =>
  a.tier === b.tier && a.researchEligibility === b.researchEligibility;

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

const eligibilityFromRow = (row: AllowlistRow): NqSessionEligibility => ({
  tradingDate: row.tradingDate,
  tier: row.tier,
  researchEligibility: row.researchEligibility || null,
  reasonCode: row.reasonCode || null,
  calendarValidity: row.calendarValidity || null,
  providerIntegrity: row.providerIntegrity || null,
  contractSelectionEvidence: row.contractSelection || null,
  observedCoverage: row.observedCoverage || null,
  selectedContract: row.selectedContract || null,
  sourceIds: row.sourceIds,
  qualification: qualificationFromEvidence(
    row.tier,
    row.researchEligibility || null,
  ),
});

/**
 * Build an eligibility index from in-memory allowlist rows (unit tests).
 */
export function createEligibilityIndex(args: {
  strictRows?: readonly AllowlistRow[];
  exploratoryRows?: readonly AllowlistRow[];
  certificationContracts?: ReadonlyMap<string, string>;
}): NqEligibilityIndex {
  const strict = new Map(
    (args.strictRows ?? []).map((row) => [row.tradingDate, row]),
  );
  const exploratory = new Map(
    (args.exploratoryRows ?? []).map((row) => [row.tradingDate, row]),
  );
  const certificationContracts = new Map(args.certificationContracts ?? []);

  return {
    certificationContract(tradingDate: string): string | null {
      return certificationContracts.get(tradingDate) ?? null;
    },
    lookup(tradingDate: string): NqSessionEligibility {
      const strictRow = strict.get(tradingDate);
      const exploratoryRow = exploratory.get(tradingDate);

      if (strictRow && exploratoryRow && !rowsAgree(strictRow, exploratoryRow)) {
        return {
          tradingDate,
          tier: "UNKNOWN",
          researchEligibility: null,
          reasonCode: "CONFLICTING_ALLOWLIST_EVIDENCE",
          calendarValidity: null,
          providerIntegrity: null,
          contractSelectionEvidence: null,
          observedCoverage: null,
          selectedContract:
            strictRow.selectedContract ||
            exploratoryRow.selectedContract ||
            certificationContracts.get(tradingDate) ||
            null,
          sourceIds: [
            ...new Set([...strictRow.sourceIds, ...exploratoryRow.sourceIds]),
          ],
          qualification: "refused",
        };
      }

      const row = strictRow ?? exploratoryRow;
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

      return eligibilityFromRow(row);
    },
  };
}

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

  return createEligibilityIndex({
    strictRows: [...strict.values()],
    exploratoryRows: [...exploratory.values()],
    certificationContracts,
  });
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
