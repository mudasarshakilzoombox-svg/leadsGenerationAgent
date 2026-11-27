import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { connect as netConnect, isIP, type Socket } from 'node:net';
import type { Readable } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';
import { connect as tlsConnect } from 'node:tls';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import {
  checkHostname,
  POLICY_BLOCK_REASONS,
  type ResolvedAddress,
  type Resolver,
  resolvePublicAddresses,
  SafeFetchError,
  systemResolver,
} from './address-policy.js';

/**
 * `SafeFetch`: the only egress path for user-influenced URLs (ADR-0022, SECURITY.md §7.2).
 *
 * - http/https on ports 80/443 only, no credentials in the URL, WHATWG URL parsing.
 * - DNS is resolved here and the socket connects to the validated IP (pinning), so a name that
 *   re-resolves to a private address (DNS rebinding) cannot be reached.
 * - Redirects are followed manually (max 5) and every hop is re-validated.
 * - 5 s connect / 15 s total timeouts, 2 MB body cap on *decoded* bytes (zip bombs), a
 *   content-type allowlist, a fixed identifying User-Agent, and no caller headers at all, so
 *   cookies or credentials can never be forwarded.
 * - At least 1 s between requests to the same host (in-process; the worker is one process).
 *
 * robots.txt is a crawling concern and is evaluated by the website crawler (Phase 1), which
 * fetches robots.txt itself through SafeFetch.
 */

export const SAFE_FETCH_DEFAULTS = {
  connectTimeoutMs: 5_000,
  totalTimeoutMs: 15_000,
  maxBytes: 2 * 1024 * 1024,
  maxRedirects: 5,
  hostIntervalMs: 1_000,
} as const;

export const MAX_URL_LENGTH = 2_048;

/** SECURITY.md §7.2 rule 4. `text/xml` is the common alias sitemaps are served with. */
export const DEFAULT_CONTENT_TYPES: readonly string[] = [
  'text/html',
  'application/xhtml+xml',
  'text/plain',
  'application/xml',
  'text/xml',
  'application/json',
];

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const EMPTY = Buffer.alloc(0);

export interface DialTarget {
  /** The validated IP to connect to. */
  address: string;
  family: 4 | 6;
  port: number;
  /** Original hostname: TLS SNI and certificate checks use it. */
  hostname: string;
  tls: boolean;
}

/** Connection seam. The real dialer connects to the pinned IP; tests route to a local server. */
export type Dialer = (target: DialTarget) => Socket;

export const directDialer: Dialer = (target) => {
  if (!target.tls) return netConnect({ host: target.address, port: target.port });
  return tlsConnect({
    host: target.address,
    port: target.port,
    // SNI must be a hostname; for IP-literal URLs the certificate is checked against the IP.
    ...(isIP(target.hostname) ? {} : { servername: target.hostname }),
    ALPNProtocols: ['http/1.1'],
  });
};

export interface HostThrottle {
  /** Resolve when a request to `host` may start. Rejects if `signal` aborts first. */
  wait(host: string, signal?: AbortSignal): Promise<void>;
}

/** Minimum spacing between requests to the same host, in this process. */
export class IntervalHostThrottle implements HostThrottle {
  private readonly nextSlot = new Map<string, number>();

  constructor(
    private readonly minIntervalMs: number = SAFE_FETCH_DEFAULTS.hostIntervalMs,
    private readonly now: () => number = Date.now,
  ) {}

  async wait(host: string, signal?: AbortSignal): Promise<void> {
    const now = this.now();
    if (this.nextSlot.size > 10_000) {
      for (const [key, at] of this.nextSlot) if (at <= now) this.nextSlot.delete(key);
    }
    const at = Math.max(now, this.nextSlot.get(host) ?? 0);
    this.nextSlot.set(host, at + this.minIntervalMs);
    if (at > now) await sleep(at - now, undefined, signal ? { signal } : {});
  }
}

export const noHostThrottle: HostThrottle = { wait: () => Promise.resolve() };

/** Minimal structured logger (pino-compatible). */
export interface SafeFetchLogger {
  warn(obj: Record<string, unknown>, msg: string): void;
}

export interface SafeFetchConfig {
  userAgent: string;
  resolver?: Resolver;
  dialer?: Dialer;
  throttle?: HostThrottle;
  logger?: SafeFetchLogger;
  connectTimeoutMs?: number;
  totalTimeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

export interface SafeFetchRequest {
  method?: 'GET' | 'HEAD';
  /** Narrow the content-type allowlist (never widen beyond what the caller can parse). */
  contentTypes?: readonly string[];
  maxBytes?: number;
  signal?: AbortSignal;
  /** For the blocked-attempt log (TM-06 detective control). */
  workspaceId?: string | null;
}

export interface SafeFetchResponse {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  headers: IncomingHttpHeaders;
  /** Lower-cased media type without parameters, or null. */
  contentType: string | null;
  /** Decoded body. Empty for HEAD, redirects that ended the chain, and non-2xx responses. */
  body: Buffer;
  /** Every redirect target followed, in order. */
  redirects: string[];
}

/** Synchronous URL policy (no DNS): use it to validate user input with a 422 early. */
export function assertFetchableUrl(input: string | URL): URL {
  const raw = typeof input === 'string' ? input.trim() : input.href;
  if (raw.length === 0 || raw.length > MAX_URL_LENGTH) {
    throw new SafeFetchError('INVALID_URL', 'Invalid URL');
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SafeFetchError('INVALID_URL', 'Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SafeFetchError('SCHEME_NOT_ALLOWED', 'Only http and https URLs are allowed');
  }
  if (url.username || url.password) {
    throw new SafeFetchError('CREDENTIALS_IN_URL', 'URLs with credentials are not allowed');
  }
  if (url.port !== '' && url.port !== '80' && url.port !== '443') {
    throw new SafeFetchError('PORT_NOT_ALLOWED', 'Only ports 80 and 443 are allowed');
  }
  checkHostname(url.hostname);
  url.hash = '';
  return url;
}

function mediaType(header: string | undefined): string | null {
  const type = header?.split(';')[0]?.trim().toLowerCase();
  return type ? type : null;
}

interface Hop {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

export class SafeFetch {
  private readonly resolver: Resolver;
  private readonly dialer: Dialer;
  private readonly throttle: HostThrottle;
  private readonly connectTimeoutMs: number;
  private readonly totalTimeoutMs: number;
  private readonly maxBytes: number;
  private readonly maxRedirects: number;

  constructor(private readonly config: SafeFetchConfig) {
    this.resolver = config.resolver ?? systemResolver;
    this.dialer = config.dialer ?? directDialer;
    this.throttle = config.throttle ?? new IntervalHostThrottle();
    this.connectTimeoutMs = config.connectTimeoutMs ?? SAFE_FETCH_DEFAULTS.connectTimeoutMs;
    this.totalTimeoutMs = config.totalTimeoutMs ?? SAFE_FETCH_DEFAULTS.totalTimeoutMs;
    this.maxBytes = config.maxBytes ?? SAFE_FETCH_DEFAULTS.maxBytes;
    this.maxRedirects = config.maxRedirects ?? SAFE_FETCH_DEFAULTS.maxRedirects;
  }

  /** Validate a URL including DNS (for "test this URL" style input checks). */
  async checkUrl(input: string | URL): Promise<URL> {
    const url = assertFetchableUrl(input);
    await resolvePublicAddresses(url.hostname, this.resolver);
    return url;
  }

  async fetch(input: string | URL, request: SafeFetchRequest = {}): Promise<SafeFetchResponse> {
    try {
      return await this.run(input, request);
    } catch (error) {
      const failure =
        error instanceof SafeFetchError
          ? error
          : new SafeFetchError('CONNECTION_FAILED', 'Connection failed');
      if (POLICY_BLOCK_REASONS.has(failure.reason)) {
        // Reason and workspace only: never the URL, path or query (may carry PII or tokens).
        this.config.logger?.warn(
          {
            event: 'safe_fetch_blocked',
            reason: failure.reason,
            workspaceId: request.workspaceId ?? null,
          },
          'SafeFetch refused a target',
        );
      }
      throw failure;
    }
  }

  private async run(input: string | URL, request: SafeFetchRequest): Promise<SafeFetchResponse> {
    let url = assertFetchableUrl(input);
    const requestedUrl = url.href;
    const redirects: string[] = [];
    let method = request.method ?? 'GET';
    let deadline: number | undefined;

    for (;;) {
      const [address] = await resolvePublicAddresses(url.hostname, this.resolver);
      if (!address) throw new SafeFetchError('DNS_FAILED', 'Host could not be resolved');
      try {
        await this.throttle.wait(url.hostname, request.signal);
      } catch {
        throw new SafeFetchError('TIMEOUT', 'Request aborted');
      }
      // The total budget starts with the first request, not while waiting for a host slot.
      deadline ??= Date.now() + this.totalTimeoutMs;
      const hop = await this.exchange(url, address, method, request, deadline);

      const location = hop.headers.location;
      if (REDIRECT_STATUSES.has(hop.status) && location) {
        if (redirects.length >= this.maxRedirects) {
          throw new SafeFetchError('TOO_MANY_REDIRECTS', 'Too many redirects');
        }
        let next: URL;
        try {
          next = new URL(location, url);
        } catch {
          throw new SafeFetchError('INVALID_URL', 'Invalid redirect target');
        }
        url = assertFetchableUrl(next);
        redirects.push(url.href);
        if (hop.status === 303 && method !== 'HEAD') method = 'GET';
        continue;
      }

      return {
        requestedUrl,
        finalUrl: url.href,
        status: hop.status,
        headers: hop.headers,
        contentType: mediaType(hop.headers['content-type']),
        body: hop.body,
        redirects,
      };
    }
  }

  private exchange(
    url: URL,
    address: ResolvedAddress,
    method: 'GET' | 'HEAD',
    request: SafeFetchRequest,
    deadline: number,
  ): Promise<Hop> {
    const allowedTypes = request.contentTypes ?? DEFAULT_CONTENT_TYPES;
    const maxBytes = Math.min(request.maxBytes ?? this.maxBytes, this.maxBytes);
    const tls = url.protocol === 'https:';
    const port = url.port ? Number(url.port) : tls ? 443 : 80;

    return new Promise<Hop>((resolve, reject) => {
      let settled = false;
      let connectTimer: NodeJS.Timeout | undefined;
      const timeout = () => settle(new SafeFetchError('TIMEOUT', 'Request timed out'));
      const totalTimer = setTimeout(timeout, Math.max(0, deadline - Date.now()));
      request.signal?.addEventListener('abort', timeout, { once: true });

      const settle = (outcome: Hop | SafeFetchError) => {
        if (settled) return;
        settled = true;
        clearTimeout(totalTimer);
        clearTimeout(connectTimer);
        request.signal?.removeEventListener('abort', timeout);
        // One request per socket (Connection: close); tear it down on every outcome.
        req.destroy();
        if (outcome instanceof SafeFetchError) reject(outcome);
        else resolve(outcome);
      };

      const req = httpRequest({
        method,
        path: `${url.pathname}${url.search}`,
        setHost: false,
        headers: {
          host: url.host,
          'user-agent': this.config.userAgent,
          accept: allowedTypes.join(', '),
          'accept-encoding': 'gzip, deflate, br',
          connection: 'close',
        },
        createConnection: () => {
          const socket = this.dialer({
            address: address.address,
            family: address.family,
            port,
            hostname: url.hostname.replace(/^\[|\]$/g, ''),
            tls,
          });
          connectTimer = setTimeout(timeout, this.connectTimeoutMs);
          socket.once('connect', () => clearTimeout(connectTimer));
          return socket;
        },
      });

      req.on('error', () => settle(new SafeFetchError('CONNECTION_FAILED', 'Connection failed')));

      req.on('response', (res) => {
        const status = res.statusCode ?? 0;
        const headers = res.headers;
        const bodyless =
          method === 'HEAD' ||
          status < 200 ||
          status >= 300 ||
          status === 204 ||
          (REDIRECT_STATUSES.has(status) && Boolean(headers.location));
        if (bodyless) {
          settle({ status, headers, body: EMPTY });
          return;
        }

        const type = mediaType(headers['content-type']);
        if (!type || !allowedTypes.includes(type)) {
          settle(new SafeFetchError('CONTENT_TYPE_NOT_ALLOWED', 'Content type not allowed'));
          return;
        }
        const declared = Number(headers['content-length']);
        if (Number.isFinite(declared) && declared > maxBytes) {
          settle(new SafeFetchError('BODY_TOO_LARGE', 'Response body too large'));
          return;
        }

        let stream: Readable = res;
        const encoding = (headers['content-encoding'] ?? 'identity').trim().toLowerCase();
        if (encoding === 'gzip' || encoding === 'x-gzip') stream = res.pipe(createGunzip());
        else if (encoding === 'deflate') stream = res.pipe(createInflate());
        else if (encoding === 'br') stream = res.pipe(createBrotliDecompress());
        else if (encoding !== 'identity' && encoding !== '') {
          settle(new SafeFetchError('UNSUPPORTED_ENCODING', 'Unsupported content encoding'));
          return;
        }

        const chunks: Buffer[] = [];
        let size = 0;
        stream.on('data', (chunk: Buffer) => {
          if (settled) return;
          size += chunk.length;
          if (size > maxBytes) {
            stream.destroy();
            settle(new SafeFetchError('BODY_TOO_LARGE', 'Response body too large'));
            return;
          }
          chunks.push(chunk);
        });
        stream.on('end', () => settle({ status, headers, body: Buffer.concat(chunks, size) }));
        const broken = () => settle(new SafeFetchError('CONNECTION_FAILED', 'Connection failed'));
        stream.on('error', broken);
        res.on('error', broken);
        // A connection that closes before the full body arrived is a failure, not a short body.
        res.on('close', () => {
          if (!res.complete) broken();
        });
      });

      if (request.signal?.aborted) timeout();
      req.end();
    });
  }
}
