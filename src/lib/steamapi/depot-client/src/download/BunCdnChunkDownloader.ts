import { createHash } from 'node:crypto';
import SteamCrypto from '@doctormckay/steam-crypto';
import type { SteamContentServer, SteamUserLike } from '../types.js';
import { decompressSteamCdnChunk, type SteamCdnCompressionOptions, type SteamCdnCompressionResult } from './SteamCdnCompression.js';

export interface BunCdnChunkDownloaderOptions {
  user: SteamUserLike;
  appId: number;
  depotId: number;
  depotKey: Buffer;
  contentServers: SteamContentServer[];
  fetchTimeoutMs?: number;
  fallbackToSteamUser?: boolean;
  debug?: (message: string) => void;
  onTiming?: (stage: 'fetch' | 'decrypt' | 'decompress' | 'verify', durationMs: number) => void;
  compression?: Omit<SteamCdnCompressionOptions, 'onResult' | 'debug'>;
  onCompression?: (result: SteamCdnCompressionResult) => void;
  /** If false, skip this package's post-decompression chunk SHA1 verification and wrapped-chunk CRC/size checks. */
  verifyChunks?: boolean;
}

interface CdnAuthTokenCacheEntry {
  promise: Promise<string>;
  expiresAtMs: number;
}

const CDN_AUTH_TOKEN_EXPIRY_SKEW_MS = 60_000;
const CDN_AUTH_TOKEN_UNKNOWN_EXPIRY_TTL_MS = 5 * 60_000;

class CdnHttpError extends Error {
  constructor(readonly status: number, statusText: string) {
    super(`HTTP error ${status} ${statusText}`.trim());
    this.name = 'CdnHttpError';
  }
}

/**
 * Bun/Fetch based SteamPipe CDN chunk downloader.
 *
 * steam-user still owns the authenticated Steam session, depot key, CDN tokens,
 * content server discovery, manifest parsing, and entitlement checks. This class
 * replaces steam-user's internal Node http/https CDN helper for chunks so callers
 * can avoid binary-string reads, repeated Buffer.concat(), and per-chunk depot-key
 * lookups inside steam-user.downloadChunk().
 */
export class BunCdnChunkDownloader {
  private serverCursor = 0;
  private readonly tokenCache = new Map<string, CdnAuthTokenCacheEntry>();
  private readonly serverPenalties = new Map<string, number>();

  constructor(private readonly options: BunCdnChunkDownloaderOptions) {
    if (options.contentServers.length === 0) 
      throw new Error('No Steam content servers were supplied to BunCdnChunkDownloader.');
    
  }

  async downloadChunk(chunkSha1: string): Promise<Buffer> {
    const normalizedSha = chunkSha1.toLowerCase();
    const server = this.nextServer();

    try {
      const result = await this.downloadChunkFromServer(normalizedSha, server);
      // Reduce penalty on success so recovered servers re-enter rotation
      const penalty = this.serverPenalties.get(server.Host) ?? 0;
      if (penalty > 0) this.serverPenalties.set(server.Host, penalty - 1);
      return result;
    } catch (error) {
      this.serverPenalties.set(server.Host, (this.serverPenalties.get(server.Host) ?? 0) + 1);

      if (!this.options.fallbackToSteamUser) throw error;

      this.options.debug?.(`bun-cdn failed for chunk ${normalizedSha}; falling back to steam-user.downloadChunk(): ${error instanceof Error ? error.message : String(error)}`);
      const response = await this.options.user.downloadChunk(this.options.appId, this.options.depotId, normalizedSha, server);
      const maybeChunk = response as { chunk?: Buffer } | Buffer;
      const chunk = Buffer.isBuffer(maybeChunk) ? maybeChunk : maybeChunk.chunk;

      if (!chunk || !Buffer.isBuffer(chunk)) 
        throw new Error('steam-user.downloadChunk() fallback returned no chunk buffer.');
      

      return chunk;
    }
  }

  private async downloadChunkFromServer(chunkSha1: string, server: SteamContentServer): Promise<Buffer> {
    const vhost = server.vhost || server.Host;
    let token = await this.getServerToken(server, vhost);
    let url = this.createChunkUrl(server, chunkSha1, token);
    let encrypted: Buffer;

    try {
      encrypted = await this.time('fetch', () => this.fetchChunk(url, vhost));
    } catch (error) {
      if (!this.isTokenAuthServer(server) || !isCdnAuthFailure(error)) 
        throw error;
      

      // Steam can reject a token before our local expiry window says it is stale
      // (clock skew, server-side invalidation, or a token minted for a bad edge).
      // Evict and retry once with a fresh token instead of poisoning this server.
      this.invalidateServerToken(vhost);
      token = await this.getServerToken(server, vhost);
      url = this.createChunkUrl(server, chunkSha1, token);
      encrypted = await this.time('fetch', () => this.fetchChunk(url, vhost));
    }

    const decrypted = await this.time('decrypt', () => SteamCrypto.symmetricDecrypt(encrypted, this.options.depotKey));
    const chunk = await this.time('decompress', () => decompressSteamCdnChunk(decrypted, {
      ...this.options.compression,
      verify: this.options.verifyChunks ?? true,
      debug: this.options.debug,
      onResult: this.options.onCompression
    }));

    if (this.options.verifyChunks ?? true) {
      const actualSha = await this.time('verify', () => sha1(chunk));
      if (actualSha !== chunkSha1) 
        throw new Error(`Checksum mismatch for chunk ${chunkSha1}`);
      
    }

    return chunk;
  }

  private async time<T>(stage: 'fetch' | 'decrypt' | 'decompress' | 'verify', fn: () => T | Promise<T>): Promise<T> {
    const startedAt = performanceNow();
    try {
      return await fn();
    } finally {
      this.options.onTiming?.(stage, performanceNow() - startedAt);
    }
  }

  private async fetchChunk(url: string, hostHeader: string): Promise<Buffer> {
    const controller = new AbortController();
    const timeoutMs = Math.max(1, Math.floor(this.options.fetchTimeoutMs ?? 15_000));
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Host: hostHeader,
          Accept: 'text/html,*/*;q=0.9',
          'Accept-Encoding': 'identity',
          'Accept-Charset': 'ISO-8859-1,utf-8,*;q=0.7',
          'User-Agent': 'Valve/Steam HTTP Client 1.0'
        }
      });

      if (!response.ok) 
        throw new CdnHttpError(response.status, response.statusText);
      

      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if ((error as Error).name === 'AbortError') 
        throw new Error(`CDN chunk request timed out after ${timeoutMs}ms`);
      

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private createChunkUrl(server: SteamContentServer, chunkSha1: string, token: string): string {
    const protocol = server.https_support === 'mandatory' ? 'https' : 'http';
    const host = validateContentServerHost(server.Host);
    return `${protocol}://${host}/depot/${this.options.depotId}/chunk/${chunkSha1}${token}`;
  }

  private async getServerToken(server: SteamContentServer, vhost: string): Promise<string> {
    if (!this.isTokenAuthServer(server)) 
      return '';
    

    const cacheKey = `${this.options.appId}:${this.options.depotId}:${vhost}`;
    const now = Date.now();
    const cached = this.tokenCache.get(cacheKey);

    if (cached && cached.expiresAtMs > now) 
      return cached.promise;
    

    if (cached) 
      this.tokenCache.delete(cacheKey);
    

    const tokenPromise = this.options.user
      .getCDNAuthToken(this.options.appId, this.options.depotId, vhost)
      .then(result => {
        const rawExpiresAtMs = new Date(result.expires).getTime();
        const expiresAtMs = Number.isFinite(rawExpiresAtMs)
          ? Math.max(Date.now(), rawExpiresAtMs - CDN_AUTH_TOKEN_EXPIRY_SKEW_MS)
          : Date.now() + CDN_AUTH_TOKEN_UNKNOWN_EXPIRY_TTL_MS;
        const entry = this.tokenCache.get(cacheKey);

        if (entry?.promise === tokenPromise) 
          entry.expiresAtMs = expiresAtMs;
        

        return result.token;
      })
      .catch(error => {
        const entry = this.tokenCache.get(cacheKey);

        if (entry?.promise === tokenPromise) 
          this.tokenCache.delete(cacheKey);
        

        throw error;
      });

    this.tokenCache.set(cacheKey, {
      promise: tokenPromise,
      // Keep concurrent requests coalesced while the token request is in flight.
      // The real expiry replaces this after Steam returns the token.
      expiresAtMs: Number.POSITIVE_INFINITY
    });

    return tokenPromise;
  }

  private invalidateServerToken(vhost: string): void {
    this.tokenCache.delete(`${this.options.appId}:${this.options.depotId}:${vhost}`);
  }

  private isTokenAuthServer(server: SteamContentServer): boolean {
    return server.usetokenauth == 1 || server.usetokenauth === '1';
  }

  private nextServer(): SteamContentServer {
    const sorted = [...this.options.contentServers].sort(
      (a, b) => (this.serverPenalties.get(a.Host) ?? 0) - (this.serverPenalties.get(b.Host) ?? 0)
    );
    return sorted[this.serverCursor++ % sorted.length]!;
  }
}

function isCdnAuthFailure(error: unknown): boolean {
  return error instanceof CdnHttpError && (error.status === 401 || error.status === 403);
}

function validateContentServerHost(host: string): string {
  if (!host || /[/?#@\s[\]\\]/.test(host)) 
    throw new Error(`Invalid Steam content server host: ${host}`);
  

  try {
    const parsed = new URL(`http://${host}`);
    if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) 
      throw new Error();
    

    return parsed.host;
  } catch {
    throw new Error(`Invalid Steam content server host: ${host}`);
  }
}

function performanceNow(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function sha1(data: Buffer): string {
  const bun = (globalThis as typeof globalThis & {
    Bun?: { CryptoHasher?: new (algorithm: string) => { update(data: Uint8Array): void; digest(encoding: 'hex'): string } };
  }).Bun;

  const hasherCtor = bun?.CryptoHasher;
  if (hasherCtor) {
    const hasher = new hasherCtor('sha1');
    hasher.update(data);
    return hasher.digest('hex');
  }

  return createHash('sha1').update(data).digest('hex');
}
