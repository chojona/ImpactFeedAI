/**
 * Causal front-month selection from the archive `rolls.csv`.
 *
 * The research pipeline chose each session's contract from *prior completed
 * session* volume. The roll row (`from_date` → `to_date`) encodes that
 * decision: on and after `to_date`, `new_contract` is active. Selecting with
 * only rolls whose `to_date <= tradingDate` therefore uses information that was
 * available before the event session opened — never a future roll.
 */
import { readCsvRecords } from "./csv";
import type { NqContractSelection, NqRollBoundary } from "./types";

export function parseRollBoundary(
  row: Readonly<Record<string, string>>,
): NqRollBoundary {
  return {
    fromDate: row.from_date ?? "",
    toDate: row.to_date ?? "",
    oldContract: row.old_contract ?? "",
    newContract: row.new_contract ?? "",
    volumeOld: Number(row.volume_old),
    volumeNew: Number(row.volume_new),
    pairedMinuteCount: Number(row.paired_minute_count),
    artificialCrossContractReturnUsed:
      String(row.artificial_cross_contract_return_used).toLowerCase() ===
      "true",
  };
}

export async function loadRollBoundaries(
  rollsCsvPath: string,
): Promise<readonly NqRollBoundary[]> {
  const rows = await readCsvRecords(rollsCsvPath);
  const rolls = rows.map(parseRollBoundary).filter(
    (roll) =>
      roll.fromDate.length > 0 &&
      roll.toDate.length > 0 &&
      roll.oldContract.length > 0 &&
      roll.newContract.length > 0,
  );
  return [...rolls].sort((a, b) => a.toDate.localeCompare(b.toDate));
}

/**
 * Select the within-contract symbol for a trading date using only past rolls.
 */
export function selectContractAsOf(
  rolls: readonly NqRollBoundary[],
  tradingDate: string,
  certificationContract: string | null = null,
): NqContractSelection {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tradingDate)) {
    throw new TypeError(`tradingDate must be YYYY-MM-DD, got ${tradingDate}`);
  }
  if (rolls.length === 0) {
    throw new Error("rolls registry is empty — cannot select a contract");
  }

  let activating: NqRollBoundary | null = null;
  for (const roll of rolls) {
    // Strictly causal: ignore rolls that activate after this trading date.
    if (roll.toDate <= tradingDate) {
      activating = roll;
    } else {
      break;
    }
  }

  const contract = activating?.newContract ?? rolls[0]!.oldContract;
  const method = activating
    ? "prior_session_volume_roll"
    : "pre_first_roll_contract";

  const conflictsWithCertification =
    certificationContract !== null && certificationContract !== contract;

  return {
    tradingDate,
    contract,
    method,
    activatingRoll: activating,
    conflictsWithCertification,
    certificationContract,
  };
}
