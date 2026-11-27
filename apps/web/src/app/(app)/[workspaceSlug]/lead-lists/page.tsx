import { LeadListItemSchema, Page } from '@lga/contracts';
import type { Metadata } from 'next';
import { LeadListsView } from '@/features/records';
import { serverApi, wsPath } from '@/lib/api/server';
import { loadWorkspace } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Lead Lists' };

export default async function LeadListsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { membership } = await loadWorkspace(params);
  const lists = await serverApi(
    wsPath(membership.workspace.id, 'lead-lists'),
    Page(LeadListItemSchema),
  );
  return <LeadListsView lists={lists.data} />;
}
