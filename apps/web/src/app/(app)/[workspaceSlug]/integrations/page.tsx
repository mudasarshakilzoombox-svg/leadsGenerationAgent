import { IntegrationsSchema } from '@lga/contracts';
import type { Metadata } from 'next';
import { IntegrationsView } from '@/features/account';
import { serverApi, wsPath } from '@/lib/api/server';
import { loadWorkspace } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Channels' };

export default async function IntegrationsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { membership } = await loadWorkspace(params);
  const data = await serverApi(wsPath(membership.workspace.id, 'integrations'), IntegrationsSchema);
  return <IntegrationsView data={data} />;
}
