'use client';

import type { z } from 'zod';
import { ApiError } from './errors';
import { hardNavigate } from '../navigate';

/**
 * Browser-side API calls (01-frontend §5.2): same-origin `/api/v1`, cookies included, and the
 * `X-Requested-With: lga-web` header the API requires on every state-changing request (CSRF).
 */
export async function api<S extends z.ZodType>(
  path: string,
  schema: S | null,
  init: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Promise<z.output<S>> {
  const res = await fetch(`/api/v1${path}`, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
      'x-requested-with': 'lga-web',
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...init.headers,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) {
    const error = await ApiError.fromResponse(res);
    if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/')) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      hardNavigate(`/login?next=${next}`);
    }
    throw error;
  }
  if (res.status === 204 || schema === null) return undefined as z.output<S>;
  return schema.parse(await res.json());
}

/** One key per user intent (03-api §6): reuse it for retries of the same submission. */
export function idempotencyKey(): string {
  return crypto.randomUUID().replaceAll('-', '');
}

export function toQuery(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}
