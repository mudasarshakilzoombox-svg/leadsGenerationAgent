// Shared Sentry options for the web app (12-observability §4, ADR-0040): errors and 10% traces,
// no session replay, nothing personal collected, and every event through the shared scrubber.
import type { BrowserOptions } from '@sentry/nextjs';
import { scrubBreadcrumb, scrubEvent } from '@lga/shared';

export const SENTRY_META = 'lga-sentry';

export interface SentryRuntimeConfig {
  dsn: string;
  release: string;
  environment: string;
}

/** No users, cookies, bodies, query strings or local variables; ids-only headers. */
export const STRICT_DATA_COLLECTION: NonNullable<BrowserOptions['dataCollection']> = {
  userInfo: false,
  cookies: false,
  httpHeaders: {
    request: { allow: ['x-request-id', 'user-agent', 'content-type'] },
    response: false,
  },
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  mcp: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
};

export function sentryOptions(config: SentryRuntimeConfig) {
  return {
    dsn: config.dsn,
    release: config.release,
    environment: config.environment,
    tracesSampleRate: 0.1,
    dataCollection: STRICT_DATA_COLLECTION,
    beforeSend: <E extends object>(event: E) => scrubEvent(event),
    beforeSendTransaction: <E extends object>(event: E) => scrubEvent(event),
    beforeBreadcrumb: <B extends { category?: string }>(breadcrumb: B) =>
      scrubBreadcrumb(breadcrumb),
  };
}

/** The ingest origin for the CSP `connect-src`, or '' when the DSN is unset or malformed. */
export function sentryIngestOrigin(dsn: string | undefined): string {
  if (!dsn) return '';
  try {
    return new URL(dsn).origin;
  } catch {
    return '';
  }
}
