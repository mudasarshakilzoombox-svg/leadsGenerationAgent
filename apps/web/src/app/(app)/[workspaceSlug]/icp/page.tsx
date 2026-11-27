import { IcpOverviewSchema } from '@lga/contracts';
import type { Metadata } from 'next';
import { IcpView } from '@/features/records';
import { serverApi, wsPath } from '@/lib/api/server';
import { loadWorkspace } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Project docs' };

export default async function IcpPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { membership } = await loadWorkspace(params);
  const data = await serverApi(wsPath(membership.workspace.id, 'icps'), IcpOverviewSchema);
  return <IcpView data={data} />;
}
