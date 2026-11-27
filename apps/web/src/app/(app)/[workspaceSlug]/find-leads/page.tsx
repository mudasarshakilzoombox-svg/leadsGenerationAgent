import { LeadItemSchema, Page } from '@lga/contracts';
import type { Metadata } from 'next';
import { FindLeadsView } from '@/features/records';
import { serverApi, wsPath } from '@/lib/api/server';
import { loadWorkspace } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Find Leads' };

export default async function FindLeadsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { membership } = await loadWorkspace(params);
  const initial = await serverApi(wsPath(membership.workspace.id, 'leads'), Page(LeadItemSchema));
  return <FindLeadsView initial={initial} />;
}
