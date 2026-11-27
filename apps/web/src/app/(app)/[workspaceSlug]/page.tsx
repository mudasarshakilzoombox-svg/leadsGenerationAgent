import { OverviewSchema, RangeKeySchema } from '@lga/contracts';
import type { Metadata } from 'next';
import { z } from 'zod';
import { OverviewView } from '@/features/overview';
import { serverApi, wsPath } from '@/lib/api/server';
import { loadWorkspace } from '@/lib/auth/session';
import { loadProjects } from '@/lib/projects';

export const metadata: Metadata = { title: 'Dashboard' };

/** Project dashboard (ADR-0036): performance for the selected project, optionally one campaign. */
export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ range?: string; campaign?: string }>;
}) {
  const { membership } = await loadWorkspace(params);
  const { project } = await loadProjects(membership.workspace.id);
  const search = await searchParams;
  const range = RangeKeySchema.catch('7d').parse(search.range ?? '7d');
  // Only a campaign of the selected project is a valid filter; anything else shows all.
  const campaign = z.uuid().safeParse(search.campaign).data;
  const validCampaign = project?.campaigns.some((c) => c.id === campaign) ? campaign : undefined;
  const query = new URLSearchParams({ range });
  if (project) query.set('project', project.id);
  if (validCampaign) query.set('campaign', validCampaign);
  const data = await serverApi(
    wsPath(membership.workspace.id, `overview?${query.toString()}`),
    OverviewSchema,
  );
  return <OverviewView data={data} />;
}
