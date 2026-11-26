import 'server-only';
import { type HealthReport, HealthReportSchema, ProblemDetailsSchema } from '@lga/contracts';
import { headers } from 'next/headers';
import type { z } from 'zod';
import { serverEnv } from '@/env';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Server Component data access (docs/architecture/01-frontend.md §5.1). Calls the API over
 * the internal network, forwards the session cookie and request id, never caches.
 */
export async function serverApi<S extends z.ZodType>(
  path: string,
  schema: S,
  init: RequestInit & { timeoutMs?: number; acceptStatuses?: number[] } = {},
): Promise<z.output<S>> {
  const { timeoutMs = 5_000, acceptStatuses = [], ...rest } = init;
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
      origin: serverEnv.APP_ORIGIN,
      ...rest.headers,
    },
  });

  const body: unknown = await res.json().catch(() => undefined);
  if (!res.ok && !acceptStatuses.includes(res.status)) {
    const problem = ProblemDetailsSchema.safeParse(body);
    throw new ApiError(
      res.status,
      problem.success ? problem.data.code : undefined,
      problem.success ? problem.data.title : `API request failed with ${res.status}`,
    );
  }
  return schema.parse(body);
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
    const reason = error instanceof Error ? error.message : 'unknown error';
    return { reachable: false, reason };
  }
}
