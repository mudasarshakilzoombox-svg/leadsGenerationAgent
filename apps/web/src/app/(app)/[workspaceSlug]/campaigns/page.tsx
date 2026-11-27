import { CampaignItemSchema, Page } from '@lga/contracts';
import type { Metadata } from 'next';
import { CampaignsView } from '@/features/outreach';
import { serverApi, wsPath } from '@/lib/api/server';
import { loadWorkspace } from '@/lib/auth/session';
import { loadProjects } from '@/lib/projects';

export const metadata: Metadata = { title: 'Campaigns' };

export default async function CampaignsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { membership } = await loadWorkspace(params);
  const { project } = await loadProjects(membership.workspace.id);
  const initial = await serverApi(
    wsPath(membership.workspace.id, project ? `campaigns?project=${project.id}` : 'campaigns'),
    Page(CampaignItemSchema),
  );
  return <CampaignsView initial={initial} />;
}
