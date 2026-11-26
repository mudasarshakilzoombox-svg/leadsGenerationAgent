/**
 * Log redaction paths (pino `redact` syntax). Logs carry IDs, never personal data,
 * message content or secrets (docs/architecture/12-observability.md §2.2).
 */
export const REDACT_PATHS: readonly string[] = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.currentPassword',
  '*.newPassword',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.apiKey',
  '*.secret',
  '*.credentials',
  '*.email',
  '*.emailAddress',
  '*.to',
  '*.from',
  '*.subject',
  '*.body',
  '*.bodyText',
  '*.bodyHtml',
  '*.content',
  '*.prompt',
  '*.completion',
  '*.firstName',
  '*.lastName',
  '*.fullName',
  '*.phone',
];

export const REDACTED = '[REDACTED]';

/** Strip the query string from a URL or path (query strings may carry tokens). */
export function stripQuery(url: string | undefined): string {
  if (!url) return '';
  const index = url.indexOf('?');
  return index === -1 ? url : url.slice(0, index);
}
