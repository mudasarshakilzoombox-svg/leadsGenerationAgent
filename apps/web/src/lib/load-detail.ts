import 'server-only';
import { notFound } from 'next/navigation';
import type { z } from 'zod';
import { ApiError, serverApi, wsPath } from './api/server';
import { loadWorkspace } from './auth/session';

/**
 * Detail pages: resolve the workspace, fetch one record, and render `not-found` for a 404
 * (which is also what another workspace's id returns, SECURITY.md §3.3).
 */
export async function loadDetail<P extends { workspaceSlug: string }, S extends z.ZodType>(
  params: Promise<P>,
  path: (p: P) => string,
  schema: S,
): Promise<z.output<S>> {
  const p = await params;
  const { membership } = await loadWorkspace(Promise.resolve(p));
  try {
    return await serverApi(wsPath(membership.workspace.id, path(p)), schema);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}
