import type {
  FetchLike,
  MarketContextFetchError,
  MarketContextProvider,
} from "@/services/market-context/types";

export function readHeader(
  headers: Headers,
  name: string,
): string | null {
  const value = headers.get(name);
  if (value === null || value.trim() === "") return null;
  return value.trim();
}

export async function fetchText(
  fetchImpl: FetchLike,
  url: string,
  provider: MarketContextProvider,
  init?: RequestInit,
): Promise<
  | {
      ok: true;
      body: string;
      statusCode: number;
      etag: string | null;
      requestId: string | null;
      endpoint: string;
    }
  | { ok: false; error: MarketContextFetchError }
> {
  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: {
        kind: "http_error",
        message: `network failure: ${detail}`,
        sourceProvider: provider,
        sourceEndpoint: url,
        statusCode: null,
      },
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: {
        kind: "http_error",
        message: `HTTP ${response.status}`,
        sourceProvider: provider,
        sourceEndpoint: url,
        statusCode: response.status,
      },
    };
  }

  try {
    const body = await response.text();
    return {
      ok: true,
      body,
      statusCode: response.status,
      etag: readHeader(response.headers, "etag"),
      requestId:
        readHeader(response.headers, "x-request-id") ??
        readHeader(response.headers, "x-amzn-requestid"),
      endpoint: url,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: {
        kind: "parse_error",
        message: `failed to read body: ${detail}`,
        sourceProvider: provider,
        sourceEndpoint: url,
        statusCode: response.status,
      },
    };
  }
}
