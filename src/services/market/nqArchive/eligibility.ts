/**
 * Session eligibility from Phase-3 allowlists and certification-by-session.
 *
 * Strict qualification requires Tier A **and** `STRICT_AND_EXPLORATORY` **and**
 * a row in the strict allowlist file. Exploratory requires Tier B **and**
 * `EXPLORATORY_ONLY` **and** a row in the exploratory allowlist file.
 * Conflicting tier/eligibility pairs, or evidence found in the wrong file,
 * refuse rather than promoting via OR.
 */
import { readCsvRecords } from "./csv";
import { NqArchiveDataError } from "./errors";
import { createTradingCalendar } from "./tradingDate";
import type {
  NqReactionQualification,
  NqResearchTier,
  NqSessionEligibility,
  NqTradingCalendar,
} from "./types";

export interface NqEligibilityIndex {
  lookup(tradingDate: string): NqSessionEligibility;
  certificationContract(tradingDate: string): string | null;
  /** Certified active-minute count for the session, when published. */
  expectedActiveMinutes(tradingDate: string): number | null;
  /** Session dates from certification-by-session.csv, when loaded. */
  readonly tradingCalendar: NqTradingCalendar | null;
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

const unlisted = (
  tradingDate: string,
  reasonCode: string,
  selectedContract: string | null,
  sourceIds: readonly string[],
): NqSessionEligibility => ({
  tradingDate,
  tier: "UNKNOWN",
  researchEligibility: null,
  reasonCode,
  calendarValidity: null,
  providerIntegrity: null,
  contractSelectionEvidence: null,
  observedCoverage: null,
  selectedContract,
  sourceIds,
  qualification: "refused",
});

/**
 * Build an eligibility index from in-memory allowlist rows (unit tests).
 */
export function createEligibilityIndex(args: {
  strictRows?: readonly AllowlistRow[];
  exploratoryRows?: readonly AllowlistRow[];
  certificationContracts?: ReadonlyMap<string, string>;
  expectedActiveMinutes?: ReadonlyMap<string, number>;
  /** Certification calendar dates; omit when no calendar was loaded. */
  tradingDates?: Iterable<string>;
}): NqEligibilityIndex {
  const strict = new Map(
    (args.strictRows ?? []).map((row) => [row.tradingDate, row]),
  );
  const exploratory = new Map(
    (args.exploratoryRows ?? []).map((row) => [row.tradingDate, row]),
  );
  const certificationContracts = new Map(args.certificationContracts ?? []);
  const expectedMinutes = new Map(args.expectedActiveMinutes ?? []);

  return {
    tradingCalendar: createTradingCalendar(args.tradingDates ?? []),
    certificationContract(tradingDate: string): string | null {
      return certificationContracts.get(tradingDate) ?? null;
    },
    expectedActiveMinutes(tradingDate: string): number | null {
      return expectedMinutes.get(tradingDate) ?? null;
    },
    lookup(tradingDate: string): NqSessionEligibility {
      const strictRow = strict.get(tradingDate);
      const exploratoryRow = exploratory.get(tradingDate);

      if (strictRow && exploratoryRow && !rowsAgree(strictRow, exploratoryRow)) {
        return unlisted(
          tradingDate,
          "CONFLICTING_ALLOWLIST_EVIDENCE",
          strictRow.selectedContract ||
            exploratoryRow.selectedContract ||
            certificationContracts.get(tradingDate) ||
            null,
          [...new Set([...strictRow.sourceIds, ...exploratoryRow.sourceIds])],
        );
      }

      const row = strictRow ?? exploratoryRow;
      if (!row) {
        return unlisted(
          tradingDate,
          "NOT_ON_ALLOWLIST",
          certificationContracts.get(tradingDate) ?? null,
          [],
        );
      }

      const eligibility = eligibilityFromRow(row);
      if (eligibility.qualification === "strict" && !strictRow) {
        return {
          ...eligibility,
          reasonCode: "STRICT_EVIDENCE_OUTSIDE_STRICT_ALLOWLIST",
          qualification: "refused",
        };
      }
      if (eligibility.qualification === "exploratory" && !exploratoryRow) {
        return {
          ...eligibility,
          reasonCode: "EXPLORATORY_EVIDENCE_OUTSIDE_EXPLORATORY_ALLOWLIST",
          qualification: "refused",
        };
      }
      return eligibility;
    },
  };
}

const parseExpectedMinutes = (raw: string, tradingDate: string): number => {
  const value = Number(raw);
  // Integer-valued floats ("1380.0") appear when a writer widens a column
  // that has gaps; fractional minutes do not exist.
  if (!/^\d+(\.0+)?$/.test(raw) || !Number.isSafeInteger(value) || value <= 0) {
    throw new NqArchiveDataError(
      `certification-by-session: invalid expected_active_minutes "${raw}" for ${tradingDate}`,
    );
  }
  return value;
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
  const expectedActiveMinutes = new Map<string, number>();
  const tradingDates: string[] = [];
  if (args.certificationBySessionCsv) {
    const rows = await readCsvRecords(args.certificationBySessionCsv);
    for (const row of rows) {
      const date = row.trading_date ?? "";
      if (!date) continue;
      tradingDates.push(date);
      const contract = row.selected_contract ?? "";
      if (contract) certificationContracts.set(date, contract);
      const minutes = (row.expected_active_minutes ?? "").trim();
      if (minutes) {
        expectedActiveMinutes.set(date, parseExpectedMinutes(minutes, date));
      }
    }
  }

  return createEligibilityIndex({
    strictRows: [...strict.values()],
    exploratoryRows: [...exploratory.values()],
    certificationContracts,
    expectedActiveMinutes,
    tradingDates,
  });
}
