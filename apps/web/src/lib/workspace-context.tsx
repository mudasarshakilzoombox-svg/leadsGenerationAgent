'use client';

import type { MembershipSummary, UserSummary } from '@lga/contracts';
import { createContext, type ReactNode, use } from 'react';

interface WorkspaceContextValue {
  user: UserSummary;
  membership: MembershipSummary;
  memberships: MembershipSummary[];
  /** API base for this workspace: `/workspaces/<id>`. */
  base: string;
  /** Link base: `/<slug>`. */
  href: (path?: string) => string;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  user,
  membership,
  memberships,
  children,
}: Omit<WorkspaceContextValue, 'base' | 'href'> & { children: ReactNode }) {
  const slug = membership.workspace.slug;
  const value: WorkspaceContextValue = {
    user,
    membership,
    memberships,
    base: `/workspaces/${membership.workspace.id}`,
    href: (path = '') => (path ? `/${slug}/${path.replace(/^\//, '')}` : `/${slug}`),
  };
  return <WorkspaceContext value={value}>{children}</WorkspaceContext>;
}

export function useWorkspace(): WorkspaceContextValue {
  const value = use(WorkspaceContext);
  if (!value) throw new Error('useWorkspace() must be used inside the workspace layout');
  return value;
}

/** Cosmetic permission check (01-frontend §6): the API enforces the real rule. */
export function useCan(permission: string): boolean {
  return useWorkspace().membership.permissions.includes(permission);
}

export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return useCan(permission) ? children : fallback;
}
