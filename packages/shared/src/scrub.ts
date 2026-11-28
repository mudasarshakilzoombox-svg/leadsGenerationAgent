// PII scrubbing for error reports (12-observability §4, SECURITY §5.4): the same deny-list as the
// pino redaction (REDACT_PATHS), applied to any value, plus email- and token-like substrings in
// free text. Isomorphic (used by the web app and the backend) and dependency-free.
import { REDACT_PATHS, REDACTED, stripQuery } from './redaction.js';

/** Field names (case-insensitive) whose values are always redacted, from REDACT_PATHS `*.name`. */
export const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  ...REDACT_PATHS.filter((p) => p.startsWith('*.')).map((p) => p.slice(2).toLowerCase()),
  'cookie',
  'cookies',
  'authorization',
  'set-cookie',
  'x-api-key',
  'passwordhash',
  'tokenhash',
  'dsn',
  'data', // request bodies
  'query_string',
]);

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Long opaque tokens (session cookies, API keys, JWT segments, provider keys).
const TOKEN = /\b(?:[A-Za-z0-9_-]{32,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g;

/** Replace emails and long tokens inside free text. */
export function scrubText(text: string): string {
  return text.replace(EMAIL, '[EMAIL]').replace(TOKEN, '[TOKEN]');
}

/** Sentry bookkeeping fields: identifiers and metadata that must reach Sentry unchanged. */
const PRESERVED_KEYS: ReadonlySet<string> = new Set([
  'event_id',
  'trace_id',
  'span_id',
  'parent_span_id',
  'release',
  'environment',
  'timestamp',
  'start_timestamp',
  'platform',
  'sdk',
  'debug_meta',
  'fingerprint',
  'level',
  'type',
]);

const MAX_DEPTH = 8;

/** Deep copy with sensitive keys redacted and free text scrubbed. Never mutates the input. */
export function scrubValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return scrubText(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (PRESERVED_KEYS.has(key)) out[key] = v;
    else out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? REDACTED : scrubValue(v, depth + 1);
  }
  return out;
}

/** Request headers that may be kept on an error report; everything else is dropped. */
const ALLOWED_HEADERS = new Set(['x-request-id', 'user-agent', 'content-type', 'accept']);

interface EventRequest {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  [key: string]: unknown;
}

/**
 * `beforeSend` for Sentry events (structurally typed, so this package needs no Sentry import):
 * drops request bodies, cookies, query strings and the user object, keeps only allow-listed
 * headers, then deep-scrubs everything else.
 */
export function scrubEvent<E extends object>(event: E): E {
  const copy = { ...(event as Record<string, unknown>) };
  delete copy.user; // sendDefaultPii is off; never attach users even if set by mistake
  const request = copy.request as EventRequest | undefined;
  if (request) {
    copy.request = {
      method: request.method,
      url: request.url ? stripQuery(request.url) : undefined,
      headers: Object.fromEntries(
        Object.entries(request.headers ?? {}).filter(([k]) => ALLOWED_HEADERS.has(k.toLowerCase())),
      ),
    };
  }
  return scrubValue(copy) as E;
}

/** `beforeBreadcrumb`: scrub messages and data; drop the whole breadcrumb if it is a console log. */
export function scrubBreadcrumb<B extends { category?: string }>(breadcrumb: B): B | null {
  if (breadcrumb.category === 'console') return null;
  return scrubValue(breadcrumb) as B;
}
