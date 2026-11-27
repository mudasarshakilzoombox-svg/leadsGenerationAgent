import 'server-only';
import { type HealthReport, HealthReportSchema } from '@lga/contracts';
import { headers } from 'next/headers';
import type { z } from 'zod';
import { serverEnv } from '@/env';
import { ApiError } from './errors';

export { ApiError } from './errors';

/**
 * Server Component data access (docs/architecture/01-frontend.md §5.1). Calls the API over
 * the internal network, forwards the session cookie and request id, never caches.
 * Paths are absolute API paths: `/api/v1/...` or `/health/...`.
 */
export async function serverApi<S extends z.ZodType>(
  path: string,
  schema: S,
  init: RequestInit & { timeoutMs?: number; acceptStatuses?: number[] } = {},
): Promise<z.output<S>> {
  const { timeoutMs = 8_000, acceptStatuses = [], ...rest } = init;
  const incoming = await headers();
  const res = await fetch(new URL(path, serverEnv.INTERNAL_API_URL), {
    ...rest,
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      accept: 'application/json',
      cookie: incoming.get('cookie') ?? '',
      'x-request-id': incoming.get('x-request-id') ?? crypto.randomUUID(),
      'x-requested-with': 'lga-web',
      'user-agent': incoming.get('user-agent') ?? 'lga-web',
      origin: serverEnv.APP_ORIGIN,
      ...rest.headers,
    },
  });
  if (!res.ok && !acceptStatuses.includes(res.status)) throw await ApiError.fromResponse(res);
  return schema.parse(await res.json());
}

/** Workspace-scoped API path helper for Server Components. */
export function wsPath(workspaceId: string, path: string): string {
  return `/api/v1/workspaces/${workspaceId}/${path}`;
}

export type ApiReadiness =
  { reachable: true; report: HealthReport } | { reachable: false; reason: string };

/** Readiness of the API (503 still carries a report). Never throws. */
export async function getApiReadiness(): Promise<ApiReadiness> {
  try {
    const report = await serverApi('/health/ready', HealthReportSchema, {
      timeoutMs: 3_000,
      acceptStatuses: [503],
    });
    return { reachable: true, report };
  } catch (error) {
    return { reachable: false, reason: error instanceof Error ? error.message : 'unknown error' };
  }
}
