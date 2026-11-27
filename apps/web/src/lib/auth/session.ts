import 'server-only';
import { type MeResponse, MeResponseSchema } from '@lga/contracts';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { ApiError, serverApi } from '@/lib/api/server';
import { safeNext } from './safe-next';

export { safeNext } from './safe-next';

/** The signed-in user and memberships, or null. One API call per request (React cache). */
export const getSession = cache(async (): Promise<MeResponse | null> => {
  try {
    return await serverApi('/api/v1/auth/me', MeResponseSchema);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
});

/**
 * For public pages (sign in, sign up, entry redirect): an unreachable API is treated as signed
 * out, so these pages still render while the API restarts. Protected pages use requireSession.
 */
export async function getSessionOrNull(): Promise<MeResponse | null> {
  try {
    return await getSession();
  } catch {
    return null;
  }
}

/** For (app) pages: the session, or a redirect to /login?next=<the requested page>. */
export async function requireSession(): Promise<MeResponse> {
  const session = await getSession();
  if (!session) {
    const next = safeNext((await headers()).get('x-pathname'));
    redirect(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
  }
  return session;
}

/** Resolve `[workspaceSlug]` to the caller's membership, or 404 (other tenants look missing). */
export async function requireMembership(slug: string) {
  const session = await requireSession();
  const membership = session.memberships.find((m) => m.workspace.slug === slug);
  if (!membership) notFound();
  return { session, membership };
}

/** Where to send a signed-in user who has no specific destination. */
export function homePath(session: MeResponse): string {
  return session.memberships.length === 1
    ? `/${session.memberships[0]!.workspace.slug}`
    : '/workspaces';
}

/** Page helper: `params` of any `[workspaceSlug]` route -> session + membership. */
export async function loadWorkspace(params: Promise<{ workspaceSlug: string }>) {
  const { workspaceSlug } = await params;
  return requireMembership(workspaceSlug);
}
