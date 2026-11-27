import { SequencesSchema } from '@lga/contracts';
import type { Metadata } from 'next';
import { SequencesView } from '@/features/project';
import { serverApi, wsPath } from '@/lib/api/server';
import { loadWorkspace } from '@/lib/auth/session';
import { loadProjects } from '@/lib/projects';

export const metadata: Metadata = { title: 'Email sequences' };

/** Each campaign's step plan for the selected project (ADR-0036). */
export default async function SequencesPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { membership } = await loadWorkspace(params);
  const { project } = await loadProjects(membership.workspace.id);
  const data = await serverApi(
    wsPath(membership.workspace.id, project ? `sequences?project=${project.id}` : 'sequences'),
    SequencesSchema,
  );
  return <SequencesView data={data} />;
}
