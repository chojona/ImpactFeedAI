import { describe, expect, it, vi } from "vitest";

import type { CandleFetchOutcome } from "../scripts/ingest/candle-provider";
import {
  DEFAULT_CANDLE_FETCH_RETRY_POLICY,
  fetchCandlesWithRetry,
  isRetryableCandleFetchOutcome,
  retryBackoffMs,
} from "../scripts/ingest/candle-fetch-retry";

const ok: CandleFetchOutcome = {
  status: "ok",
  candles: [],
  priceBasis: "AS_TRADED",
  adjustmentFactor: null,
  volumeWithheld: 0,
};

describe("isRetryableCandleFetchOutcome", () => {
  it("retries only provider_error", () => {
    expect(isRetryableCandleFetchOutcome({ status: "provider_error" })).toBe(
      true,
    );
    expect(isRetryableCandleFetchOutcome({ status: "unreachable" })).toBe(
      false,
    );
    expect(isRetryableCandleFetchOutcome({ status: "basis_rejected" })).toBe(
      false,
    );
    expect(isRetryableCandleFetchOutcome({ status: "empty" })).toBe(false);
    expect(isRetryableCandleFetchOutcome({ status: "ok" })).toBe(false);
  });
});

describe("retryBackoffMs", () => {
  it("doubles until the cap", () => {
    const policy = { maxAttempts: 5, baseDelayMs: 1000, maxDelayMs: 4000 };
    expect(retryBackoffMs(1, policy)).toBe(1000);
    expect(retryBackoffMs(2, policy)).toBe(2000);
    expect(retryBackoffMs(3, policy)).toBe(4000);
    expect(retryBackoffMs(4, policy)).toBe(4000);
  });
});

describe("fetchCandlesWithRetry", () => {
  it("returns immediately on terminal success", async () => {
    const fetch = vi.fn(async () => ok);
    const sleep = vi.fn(async () => undefined);
    const result = await fetchCandlesWithRetry(fetch, { sleep });
    expect(result.attempts).toBe(1);
    expect(result.outcome.status).toBe("ok");
    expect(sleep).not.toHaveBeenCalled();
  });

  it("does not retry unreachable / basis_rejected / empty", async () => {
    const terminals: CandleFetchOutcome[] = [
      { status: "unreachable", reason: "too old" },
      { status: "basis_rejected", ratio: 2, reason: "split" },
      { status: "empty", reason: "no bars" },
    ];

    for (const outcome of terminals) {
      const fetch = vi.fn(async () => outcome);
      const sleep = vi.fn(async () => undefined);
      const result = await fetchCandlesWithRetry(fetch, { sleep });
      expect(result.attempts).toBe(1);
      expect(result.outcome).toEqual(outcome);
      expect(sleep).not.toHaveBeenCalled();
    }
  });

  it("retries provider_error then returns success", async () => {
    const fetch = vi
      .fn(async (): Promise<CandleFetchOutcome> => ok)
      .mockResolvedValueOnce({
        status: "provider_error",
        reason: "timeout",
      })
      .mockResolvedValueOnce(ok);
    const sleep = vi.fn(async () => undefined);
    const onRetry = vi.fn();

    const result = await fetchCandlesWithRetry(fetch, {
      sleep,
      onRetry,
      policy: DEFAULT_CANDLE_FETCH_RETRY_POLICY,
    });

    expect(result.attempts).toBe(2);
    expect(result.outcome.status).toBe("ok");
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("stops after the attempt budget on persistent provider_error", async () => {
    const fetch = vi.fn(async (): Promise<CandleFetchOutcome> => ({
      status: "provider_error",
      reason: "503",
    }));
    const sleep = vi.fn(async () => undefined);

    const result = await fetchCandlesWithRetry(fetch, {
      sleep,
      policy: { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 40 },
    });

    expect(result.attempts).toBe(3);
    expect(result.outcome.status).toBe("provider_error");
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
