import { Page, SentItemSchema } from '@lga/contracts';
import type { Metadata } from 'next';
import { SentView } from '@/features/project';
import { serverApi, wsPath } from '@/lib/api/server';
import { loadWorkspace } from '@/lib/auth/session';
import { loadProjects } from '@/lib/projects';

export const metadata: Metadata = { title: 'Sent' };

/** Sent outreach emails for the selected project (ADR-0036). */
export default async function SentPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { membership } = await loadWorkspace(params);
  const { project } = await loadProjects(membership.workspace.id);
  const initial = await serverApi(
    wsPath(membership.workspace.id, project ? `sent?project=${project.id}` : 'sent'),
    Page(SentItemSchema),
  );
  return <SentView initial={initial} />;
}
