/**
 * Synthetic NQ archive fixtures. Every price, volume and manifest row here is
 * invented — nothing is copied from the licensed Databento archive.
 */
import type {
  AllowlistRow,
  NqMinuteBar,
  NqRollBoundary,
} from "@/services/market/nqArchive";

export const ROLLS: readonly NqRollBoundary[] = [
  {
    fromDate: "2024-03-15",
    toDate: "2024-03-18",
    oldContract: "NQH24",
    newContract: "NQM24",
    volumeOld: 100,
    volumeNew: 200,
    pairedMinuteCount: 1000,
    artificialCrossContractReturnUsed: false,
  },
  {
    fromDate: "2024-06-14",
    toDate: "2024-06-17",
    oldContract: "NQM24",
    newContract: "NQU24",
    volumeOld: 110,
    volumeNew: 220,
    pairedMinuteCount: 1000,
    artificialCrossContractReturnUsed: false,
  },
];

export const allowlistRow = (
  partial: Partial<AllowlistRow> &
    Pick<AllowlistRow, "tradingDate" | "tier" | "researchEligibility">,
): AllowlistRow => ({
  reasonCode: "FIXTURE",
  calendarValidity: "REVIEWED_REGULAR",
  providerIntegrity: "AVAILABLE",
  contractSelection: "PRIOR_VOLUME_PRESENT",
  observedCoverage: "FULL_ACTIVE_GRID",
  selectedContract: "NQM24",
  sourceIds: ["FIXTURE"],
  ...partial,
});

export const tierA = (
  tradingDate: string,
  selectedContract = "NQM24",
): AllowlistRow =>
  allowlistRow({
    tradingDate,
    tier: "A",
    researchEligibility: "STRICT_AND_EXPLORATORY",
    selectedContract,
  });

export const tierB = (
  tradingDate: string,
  selectedContract = "NQM24",
): AllowlistRow =>
  allowlistRow({
    tradingDate,
    tier: "B",
    researchEligibility: "EXPLORATORY_ONLY",
    selectedContract,
  });

const EDT_OFFSET_MS = 4 * 3_600_000;

/**
 * Independent oracle for post-2012 Globex hours, valid ONLY for instants inside
 * US daylight time (fixed UTC-4). Returns the trading date of an active minute
 * or null for the daily 17:00–18:00 ET break and the weekend closure.
 */
export const edtGlobexTradingDate = (openAt: Date): string | null => {
  const ny = new Date(openAt.getTime() - EDT_OFFSET_MS);
  const day = ny.getUTCDay();
  const hour = ny.getUTCHours();
  const active =
    day === 6 ? false : day === 0 ? hour >= 18 : day === 5 ? hour < 17 : hour !== 17;
  if (!active) return null;
  const date = new Date(
    Date.UTC(
      ny.getUTCFullYear(),
      ny.getUTCMonth(),
      ny.getUTCDate() + (hour >= 18 ? 1 : 0),
    ),
  );
  return date.toISOString().slice(0, 10);
};

/** Synthetic bars on every active EDT Globex minute in [startIso, endIso]. */
export function edtSessionBars(args: {
  contract: string;
  startIso: string;
  endIso: string;
  basePrice?: number;
  skip?: (openAt: Date) => boolean;
}): NqMinuteBar[] {
  const start = Date.parse(args.startIso);
  const end = Date.parse(args.endIso);
  const out: NqMinuteBar[] = [];
  let i = 0;
  for (let t = start; t <= end; t += 60_000) {
    const openAt = new Date(t);
    const tradingDate = edtGlobexTradingDate(openAt);
    if (tradingDate === null || args.skip?.(openAt)) continue;
    const px = (args.basePrice ?? 15_000) + (i % 40) * 0.25;
    i += 1;
    out.push({
      openAt,
      tradingDate,
      contract: args.contract,
      open: px,
      high: px + 0.5,
      low: px - 0.25,
      close: px + 0.25,
      volume: 5,
      tsEventNs: BigInt(t) * BigInt(1_000_000),
    });
  }
  return out;
}

/** One hand-built bar (UTC instant) for anchor / parquet edge cases. */
export const bar = (
  iso: string,
  overrides: Partial<NqMinuteBar> = {},
): NqMinuteBar => ({
  openAt: new Date(iso),
  tradingDate: iso.slice(0, 10),
  contract: "NQM24",
  open: 100,
  high: 102,
  low: 99,
  close: 101,
  volume: 1,
  tsEventNs: null,
  ...overrides,
});
