import { ConversationItemSchema, Page } from '@lga/contracts';
import type { Metadata } from 'next';
import { InboxView } from '@/features/outreach';
import { serverApi, wsPath } from '@/lib/api/server';
import { loadWorkspace } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Inbox' };

export default async function InboxPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { membership } = await loadWorkspace(params);
  const initial = await serverApi(
    wsPath(membership.workspace.id, 'conversations?filter=all'),
    Page(ConversationItemSchema),
  );
  return <InboxView initial={initial} />;
}
