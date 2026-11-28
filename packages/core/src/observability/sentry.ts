// Error tracking (12-observability §4, ADR-0040): Sentry for api and worker, off unless
// SENTRY_DSN is set. Every event passes the shared PII scrubber; request bodies, cookies and
// users are never attached. Expected 4xx DomainErrors are not reported (the filter decides).
import * as Sentry from '@sentry/node';
import { scrubBreadcrumb, scrubEvent } from '@lga/shared';
import type { BaseServerEnv } from '../config/env.js';

export type ReportingService = 'api' | 'worker';

/** Ids only (never emails, names or bodies) to correlate a report with logs. */
export interface ReportContext {
  requestId?: string | undefined;
  workspaceId?: string | null | undefined;
  queue?: string | undefined;
  jobName?: string | undefined;
  jobId?: string | undefined;
  status?: number | undefined;
  code?: string | undefined;
}

/** No users, cookies, bodies, query strings, local variables or payloads; ids-only headers. */
export const STRICT_DATA_COLLECTION = {
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
} satisfies NonNullable<Parameters<typeof Sentry.init>[0]>['dataCollection'];

let enabled = false;

export function initSentry(
  service: ReportingService,
  env: Pick<BaseServerEnv, 'SENTRY_DSN' | 'SENTRY_TRACES_SAMPLE_RATE' | 'RELEASE' | 'APP_ENV'>,
): boolean {
  if (!env.SENTRY_DSN) {
    enabled = false;
    return false;
  }
  Sentry.init({
    dsn: env.SENTRY_DSN,
    release: env.RELEASE,
    environment: env.APP_ENV,
    serverName: service, // never the container hostname
    // Collect nothing personal (Sentry v11 `dataCollection` replaces `sendDefaultPii`). The scrubber
    // below is the second line of defence.
    dataCollection: STRICT_DATA_COLLECTION,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    initialScope: { tags: { service } },
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  });
  enabled = true;
  return true;
}

export function sentryEnabled(): boolean {
  return enabled;
}

/** Report an unexpected error with correlation ids. No-op when Sentry is off. */
export function reportError(error: unknown, context: ReportContext = {}): void {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(context)) {
      if (value !== undefined && value !== null) scope.setTag(key, String(value));
    }
    Sentry.captureException(error);
  });
}

/** Flush queued events (call before exiting). */
export async function flushSentry(timeoutMs = 2_000): Promise<boolean> {
  return enabled ? Sentry.flush(timeoutMs) : true;
}
