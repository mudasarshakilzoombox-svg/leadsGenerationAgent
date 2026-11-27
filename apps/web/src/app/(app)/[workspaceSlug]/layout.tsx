import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { loadWorkspace } from '@/lib/auth/session';
import { loadProjects } from '@/lib/projects';
import { WorkspaceProvider } from '@/lib/workspace-context';

/** Resolves the slug to the caller's membership (404 otherwise) and renders the app shell. */
export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { session, membership } = await loadWorkspace(params);
  const { projects, project, unreadReplies } = await loadProjects(membership.workspace.id);
  return (
    <WorkspaceProvider
      user={session.user}
      membership={membership}
      memberships={session.memberships}
      projects={projects}
      project={project}
      unreadReplies={unreadReplies}
    >
      <AppShell>{children}</AppShell>
    </WorkspaceProvider>
  );
}
