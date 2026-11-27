/**
 * The only network path for release-calendar adapters.
 *
 * Access policy (verified 2026-11-27, see docs/data-acquisition-plan.md):
 *   - www.federalreserve.gov, www.frbsf.org, www.bea.gov, api.stlouisfed.org
 *     answer an honest, non-browser User-Agent and their robots.txt permits
 *     these paths.
 *   - www.bls.gov / data.bls.gov block non-browser clients and prohibit bot
 *     activity outside BLS usage policy. They are DENIED here; BLS documents
 *     enter only as operator-saved files (source-bls-local.ts).
 *   - apps.bea.gov robots.txt disallows "/". DENIED.
 *
 * The client never impersonates a browser, never rotates headers, and treats
 * 403/429 as a stop signal for that host rather than something to work around.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { sha256 } from "./text";

export const USER_AGENT =
  "ImpactFeedAI-release-calendar/1.0 (non-commercial research; low-rate; cached)";

export const ALLOWED_HOSTS = new Set([
  "www.federalreserve.gov",
  "www.frbsf.org",
  "www.bea.gov",
  "api.stlouisfed.org",
]);

export const DENIED_HOSTS: Readonly<Record<string, string>> = {
  "www.bls.gov": "BLS blocks automated clients; use operator-saved documents (--bls-dir)",
  "bls.gov": "BLS blocks automated clients; use operator-saved documents (--bls-dir)",
  "data.bls.gov": "BLS blocks automated clients; use operator-saved documents (--bls-dir)",
  "apps.bea.gov": "apps.bea.gov robots.txt disallows all paths",
};

export class AccessRefusedError extends Error {
  constructor(
    readonly url: string,
    readonly status: number | null,
    reason: string,
  ) {
    super(`${reason}: ${url}`);
    this.name = "AccessRefusedError";
  }
}

export interface FetchedDocument {
  readonly url: string;
  readonly finalUrl: string;
  readonly body: Uint8Array;
  readonly retrievedAt: string;
  readonly contentSha256: string;
  readonly fromCache: boolean;
}

export interface PoliteFetcherOptions {
  readonly cacheDir: string | null;
  /** Minimum spacing between requests to one host. */
  readonly minIntervalMs?: number;
  /** When true, only the cache is consulted; a miss throws. */
  readonly offline?: boolean;
  readonly fetchImpl?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
  /** Strip secrets (e.g. api_key) from a URL before it is logged or cited. */
  readonly redact?: (url: string) => string;
}

export function redactSecrets(url: string): string {
  return url.replace(/([?&](?:api_key|apikey|registrationkey)=)[^&]+/gi, "$1REDACTED");
}

function assertPermitted(raw: string): URL {
  const u = new URL(raw);
  if (u.protocol !== "https:") throw new AccessRefusedError(raw, null, "only HTTPS is permitted");
  const denied = DENIED_HOSTS[u.hostname];
  if (denied) throw new AccessRefusedError(redactSecrets(raw), null, denied);
  if (!ALLOWED_HOSTS.has(u.hostname)) {
    throw new AccessRefusedError(redactSecrets(raw), null, "host is not on the release-calendar allowlist");
  }
  return u;
}

interface CacheEntry {
  /** 200 for a document; 404 is cached too so offline replays reproduce online runs. */
  status?: number;
  url: string;
  finalUrl: string;
  retrievedAt: string;
  contentSha256: string;
  bodyBase64: string;
}

export class PoliteFetcher {
  private readonly lastRequestAt = new Map<string, number>();
  private readonly refusedHosts = new Map<string, number>();
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly redact: (url: string) => string;
  private readonly minIntervalMs: number;

  constructor(private readonly opts: PoliteFetcherOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = opts.now ?? Date.now;
    this.redact = opts.redact ?? redactSecrets;
    this.minIntervalMs = opts.minIntervalMs ?? 2000;
  }

  private cachePath(url: string): string | null {
    return this.opts.cacheDir ? path.join(this.opts.cacheDir, `${sha256(this.redact(url))}.json`) : null;
  }

  private async readCache(url: string): Promise<FetchedDocument | null> {
    const p = this.cachePath(url);
    if (!p) return null;
    try {
      const entry = JSON.parse(await readFile(p, "utf8")) as CacheEntry;
      if (entry.status === 404) throw new AccessRefusedError(entry.url, 404, "HTTP 404 (cached)");
      const body = new Uint8Array(Buffer.from(entry.bodyBase64, "base64"));
      if (sha256(body) !== entry.contentSha256) return null; // corrupt cache entry
      return { url: entry.url, finalUrl: entry.finalUrl, body, retrievedAt: entry.retrievedAt,
        contentSha256: entry.contentSha256, fromCache: true };
    } catch (err) {
      if (err instanceof AccessRefusedError) throw err;
      return null;
    }
  }

  private async writeCache(doc: FetchedDocument): Promise<void> {
    const p = this.cachePath(doc.url);
    if (!p) return;
    await mkdir(path.dirname(p), { recursive: true });
    const entry: CacheEntry = { url: doc.url, finalUrl: doc.finalUrl, retrievedAt: doc.retrievedAt,
      contentSha256: doc.contentSha256, bodyBase64: Buffer.from(doc.body).toString("base64") };
    await writeFile(p, JSON.stringify(entry));
  }

  async get(rawUrl: string): Promise<FetchedDocument> {
    const u = assertPermitted(rawUrl);
    const cited = this.redact(rawUrl);
    const cached = await this.readCache(rawUrl);
    if (cached) return cached;
    if (this.opts.offline) throw new AccessRefusedError(cited, null, "offline mode and not cached");
    const refused = this.refusedHosts.get(u.hostname);
    if (refused !== undefined) {
      throw new AccessRefusedError(cited, refused, `host previously refused access (HTTP ${refused}); not retrying`);
    }

    for (let attempt = 0; ; attempt++) {
      const last = this.lastRequestAt.get(u.hostname);
      if (last !== undefined) {
        const wait = last + this.minIntervalMs - this.now();
        if (wait > 0) await this.sleep(wait);
      }
      this.lastRequestAt.set(u.hostname, this.now());
      const res = await this.fetchImpl(rawUrl, {
        headers: { "User-Agent": USER_AGENT },
        redirect: "follow",
      });
      const finalUrl = res.url || rawUrl;
      if (res.status === 403 || res.status === 429) {
        this.refusedHosts.set(u.hostname, res.status);
        throw new AccessRefusedError(cited, res.status, `HTTP ${res.status}; stopping requests to ${u.hostname}`);
      }
      if (res.status >= 500 && attempt < 2) {
        await this.sleep(this.minIntervalMs * 2 ** (attempt + 1));
        continue;
      }
      if (res.status === 404) {
        const p = this.cachePath(rawUrl);
        if (p) {
          await mkdir(path.dirname(p), { recursive: true });
          const miss: CacheEntry = { status: 404, url: cited, finalUrl: this.redact(finalUrl),
            retrievedAt: new Date(this.now()).toISOString(), contentSha256: sha256(""), bodyBase64: "" };
          await writeFile(p, JSON.stringify(miss));
        }
        throw new AccessRefusedError(cited, 404, "HTTP 404");
      }
      if (!res.ok) throw new AccessRefusedError(cited, res.status, `HTTP ${res.status}`);
      assertPermitted(finalUrl); // a redirect must not leave the allowlist
      const body = new Uint8Array(await res.arrayBuffer());
      const doc: FetchedDocument = {
        url: cited,
        finalUrl: this.redact(finalUrl),
        body,
        retrievedAt: new Date(this.now()).toISOString(),
        contentSha256: sha256(body),
        fromCache: false,
      };
      await this.writeCache(doc);
      return doc;
    }
  }
}

export const decodeUtf8 = (body: Uint8Array): string => new TextDecoder("utf-8").decode(body);
/** Pre-2000 government text files are often Latin-1. */
export const decodeLatin1 = (body: Uint8Array): string => new TextDecoder("latin1").decode(body);
