import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { AccessRefusedError, PoliteFetcher, USER_AGENT } from "../scripts/ingest/release-calendar/polite-fetch";

function harness(responses: Record<string, { status: number; body?: string; url?: string }>) {
  let clock = 1_000_000;
  const sleeps: number[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const spec = responses[url] ?? { status: 404 };
    expect((init?.headers as Record<string, string>)["User-Agent"]).toBe(USER_AGENT);
    const res = new Response(spec.body ?? "", { status: spec.status });
    Object.defineProperty(res, "url", { value: spec.url ?? url });
    return res;
  });
  return {
    fetchImpl,
    sleeps,
    make: (cacheDir: string | null = null, offline = false) => new PoliteFetcher({
      cacheDir, offline, minIntervalMs: 2000, fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async (ms) => { sleeps.push(ms); clock += ms; }, now: () => clock,
    }),
  };
}

describe("polite release-calendar fetcher", () => {
  it("refuses BLS and apps.bea.gov before any request is made", async () => {
    const h = harness({});
    const f = h.make();
    await expect(f.get("https://www.bls.gov/news.release/archives/cpi_01112024.htm")).rejects.toThrow(/operator-saved/);
    await expect(f.get("https://apps.bea.gov/histdata/")).rejects.toThrow(/robots/);
    await expect(f.get("https://example.com/x")).rejects.toThrow(/allowlist/);
    expect(h.fetchImpl).not.toHaveBeenCalled();
  });

  it("spaces requests per host and identifies itself honestly", async () => {
    const a = "https://www.federalreserve.gov/a.htm";
    const b = "https://www.federalreserve.gov/b.htm";
    const h = harness({ [a]: { status: 200, body: "A" }, [b]: { status: 200, body: "B" } });
    const f = h.make();
    await f.get(a);
    await f.get(b);
    expect(h.sleeps).toEqual([2000]);
  });

  it("stops contacting a host after 403/429 instead of retrying differently", async () => {
    const a = "https://www.bea.gov/news/2026/a";
    const b = "https://www.bea.gov/news/2026/b";
    const h = harness({ [a]: { status: 429 }, [b]: { status: 200, body: "B" } });
    const f = h.make();
    await expect(f.get(a)).rejects.toBeInstanceOf(AccessRefusedError);
    await expect(f.get(b)).rejects.toThrow(/previously refused/);
    expect(h.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects a redirect that leaves the allowlist", async () => {
    const a = "https://www.frbsf.org/x.xlsx";
    const h = harness({ [a]: { status: 200, body: "x", url: "https://cdn.example.net/x.xlsx" } });
    await expect(h.make().get(a)).rejects.toThrow(/allowlist/);
  });

  it("caches with secrets redacted and replays offline without network", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "relcal-"));
    const url = "https://api.stlouisfed.org/fred/release/dates?release_id=10&api_key=SECRET123";
    const h = harness({ [url]: { status: 200, body: '{"release_dates":[]}' } });
    const first = await h.make(dir).get(url);
    expect(first.url).not.toContain("SECRET123");
    const files = await readdir(dir);
    expect(files).toHaveLength(1);
    expect(await readFile(path.join(dir, files[0]), "utf8")).not.toContain("SECRET123");
    const replay = await h.make(dir, true).get(url);
    expect(replay).toMatchObject({ fromCache: true, contentSha256: first.contentSha256 });
    expect(h.fetchImpl).toHaveBeenCalledTimes(1);
    await expect(h.make(dir, true).get("https://www.bea.gov/uncached")).rejects.toThrow(/offline/);
    // A 404 is cached so an offline replay ends a discovery loop exactly where the online run did.
    const gone = "https://www.federalreserve.gov/monetarypolicy/fomchistorical2021.htm";
    await expect(h.make(dir).get(gone)).rejects.toMatchObject({ status: 404 });
    await expect(h.make(dir, true).get(gone)).rejects.toMatchObject({ status: 404 });
  });
});
