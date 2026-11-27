/**
 * Session eligibility from Phase-3 allowlists and certification-by-session.
 *
 * Strict qualification requires Tier A **and** `STRICT_AND_EXPLORATORY` **and**
 * a row in the strict allowlist file. Exploratory requires Tier B **and**
 * `EXPLORATORY_ONLY` **and** a row in the exploratory allowlist file.
 * Conflicting tier/eligibility pairs, allowlists that disagree on a date's
 * tier, eligibility, contract or minute count, or evidence found in the wrong
 * file, refuse rather than promoting via OR. A manifest that lists any trading
 * date twice is unparseable as a whole.
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
  /**
   * Allowlist `expected_active_minutes` for the session; null when absent or
   * when the two allowlists disagree.
   */
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
  /** Certified active minutes for the session; null when not published. */
  expectedActiveMinutes: number | null;
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
  a.tier === b.tier &&
  a.researchEligibility === b.researchEligibility &&
  a.selectedContract === b.selectedContract &&
  (a.expectedActiveMinutes === null ||
    b.expectedActiveMinutes === null ||
    a.expectedActiveMinutes === b.expectedActiveMinutes);

const parseExpectedMinutes = (raw: string, tradingDate: string): number | null => {
  if (raw === "") return null;
  const value = Number(raw);
  // Integer-valued floats ("1380.0") appear when a writer widens a column
  // that has gaps; fractional minutes do not exist.
  if (!/^\d+(\.0+)?$/.test(raw) || !Number.isSafeInteger(value) || value <= 0) {
    throw new NqArchiveDataError(
      `allowlist: invalid expected_active_minutes "${raw}" for ${tradingDate}`,
    );
  }
  return value;
};

/**
 * Index manifest rows by trading date. A manifest that lists a date twice has
 * no defensible winner, so the whole manifest is refused rather than letting
 * row order decide.
 */
const byTradingDate = <T>(
  rows: Iterable<T>,
  dateOf: (row: T) => string,
  manifest: string,
): Map<string, T> => {
  const map = new Map<string, T>();
  for (const row of rows) {
    const date = dateOf(row);
    if (map.has(date)) {
      throw new NqArchiveDataError(
        `${manifest}: trading_date ${date} appears more than once`,
      );
    }
    map.set(date, row);
  }
  return map;
};

const parseAllowlist = (
  rows: ReadonlyArray<Readonly<Record<string, string>>>,
): AllowlistRow[] => {
  const parsed: AllowlistRow[] = [];
  for (const row of rows) {
    const tradingDate = row.trading_date ?? "";
    if (!tradingDate) continue;
    parsed.push({
      expectedActiveMinutes: parseExpectedMinutes(
        (row.expected_active_minutes ?? "").trim(),
        tradingDate,
      ),
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
  return parsed;
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
  /** Certification calendar dates; omit when no calendar was loaded. */
  tradingDates?: Iterable<string>;
}): NqEligibilityIndex {
  const strict = byTradingDate(
    args.strictRows ?? [],
    (row) => row.tradingDate,
    "strict allowlist",
  );
  const exploratory = byTradingDate(
    args.exploratoryRows ?? [],
    (row) => row.tradingDate,
    "exploratory allowlist",
  );
  const certificationContracts = new Map(args.certificationContracts ?? []);

  return {
    tradingCalendar: createTradingCalendar(args.tradingDates ?? []),
    certificationContract(tradingDate: string): string | null {
      return certificationContracts.get(tradingDate) ?? null;
    },
    expectedActiveMinutes(tradingDate: string): number | null {
      const strictRow = strict.get(tradingDate);
      const exploratoryRow = exploratory.get(tradingDate);
      if (strictRow && exploratoryRow && !rowsAgree(strictRow, exploratoryRow)) {
        return null;
      }
      return (
        strictRow?.expectedActiveMinutes ??
        exploratoryRow?.expectedActiveMinutes ??
        null
      );
    },
    lookup(tradingDate: string): NqSessionEligibility {
      const strictRow = strict.get(tradingDate);
      const exploratoryRow = exploratory.get(tradingDate);

      if (strictRow && exploratoryRow && !rowsAgree(strictRow, exploratoryRow)) {
        return unlisted(
          tradingDate,
          "CONFLICTING_ALLOWLIST_EVIDENCE",
          strictRow.selectedContract === exploratoryRow.selectedContract
            ? strictRow.selectedContract || null
            : null,
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

export async function loadEligibilityIndex(args: {
  strictAllowlistCsv?: string;
  exploratoryAllowlistCsv?: string;
  certificationBySessionCsv?: string;
}): Promise<NqEligibilityIndex> {
  const strictRows = args.strictAllowlistCsv
    ? parseAllowlist(await readCsvRecords(args.strictAllowlistCsv))
    : [];
  const exploratoryRows = args.exploratoryAllowlistCsv
    ? parseAllowlist(await readCsvRecords(args.exploratoryAllowlistCsv))
    : [];

  // expected_active_minutes lives in the allowlists; certification-by-session
  // supplies only the session calendar and certified contracts.
  const certificationContracts = new Map<string, string>();
  const tradingDates: string[] = [];
  if (args.certificationBySessionCsv) {
    const rows = byTradingDate(
      (await readCsvRecords(args.certificationBySessionCsv)).filter(
        (row) => (row.trading_date ?? "") !== "",
      ),
      (row) => row.trading_date ?? "",
      "certification-by-session",
    );
    for (const [date, row] of rows) {
      tradingDates.push(date);
      const contract = row.selected_contract ?? "";
      if (contract) certificationContracts.set(date, contract);
    }
  }

  return createEligibilityIndex({
    strictRows,
    exploratoryRows,
    certificationContracts,
    tradingDates,
  });
}
