/**
 * Bounded retries for candle provider fetches.
 *
 * Only transient `provider_error` outcomes are retried. Unreachable windows,
 * basis rejections, empty responses, and successful fetches are terminal —
 * retrying them cannot heal the outcome and would only burn rate limit.
 */
import type { CandleFetchOutcome } from "./candle-provider";

export type CandleFetchTerminalStatus = CandleFetchOutcome["status"];

export interface RetryPolicy {
  /** Maximum fetch attempts (including the first). Default 3. */
  maxAttempts: number;
  /** Base delay before the first retry. Default 1_000 ms. */
  baseDelayMs: number;
  /** Cap on backoff delay. Default 8_000 ms. */
  maxDelayMs: number;
}

export const DEFAULT_CANDLE_FETCH_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 1_000,
  maxDelayMs: 8_000,
};

/**
 * Whether an outcome should be retried. Only `provider_error` is retryable;
 * everything else is treated as terminal.
 */
export function isRetryableCandleFetchOutcome(
  outcome: Pick<CandleFetchOutcome, "status">,
): boolean {
  return outcome.status === "provider_error";
}

/** Exponential backoff delay for the attempt that just failed (1-based). */
export function retryBackoffMs(
  failedAttempt: number,
  policy: RetryPolicy = DEFAULT_CANDLE_FETCH_RETRY_POLICY,
): number {
  const exp = Math.max(0, failedAttempt - 1);
  return Math.min(policy.baseDelayMs * 2 ** exp, policy.maxDelayMs);
}

export interface FetchWithRetryResult {
  outcome: CandleFetchOutcome;
  attempts: number;
}

export interface FetchWithRetryOptions {
  policy?: RetryPolicy;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (info: {
    attempt: number;
    delayMs: number;
    reason: string;
  }) => void;
}

/**
 * Call `fetch` until a terminal outcome or the attempt budget is exhausted.
 * The last outcome is always returned — never invented.
 */
export async function fetchCandlesWithRetry(
  fetch: () => Promise<CandleFetchOutcome>,
  options: FetchWithRetryOptions = {},
): Promise<FetchWithRetryResult> {
  const policy = options.policy ?? DEFAULT_CANDLE_FETCH_RETRY_POLICY;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let attempts = 0;
  let outcome: CandleFetchOutcome = {
    status: "provider_error",
    reason: "fetchCandlesWithRetry made no attempts",
  };

  while (attempts < policy.maxAttempts) {
    attempts += 1;
    outcome = await fetch();

    if (!isRetryableCandleFetchOutcome(outcome)) {
      return { outcome, attempts };
    }

    if (attempts >= policy.maxAttempts) {
      return { outcome, attempts };
    }

    const delayMs = retryBackoffMs(attempts, policy);
    const reason =
      outcome.status === "provider_error" ? outcome.reason : "retryable error";
    options.onRetry?.({
      attempt: attempts,
      delayMs,
      reason,
    });
    await sleep(delayMs);
  }

  return { outcome, attempts };
}
