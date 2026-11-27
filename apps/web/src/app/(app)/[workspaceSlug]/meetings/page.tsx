import { MeetingItemSchema, Page } from '@lga/contracts';
import type { Metadata } from 'next';
import { MeetingsView } from '@/features/outreach';
import { serverApi, wsPath } from '@/lib/api/server';
import { loadWorkspace } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Meetings' };

export default async function MeetingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { membership } = await loadWorkspace(params);
  const upcoming = await serverApi(
    wsPath(membership.workspace.id, 'meetings?when=upcoming'),
    Page(MeetingItemSchema),
  );
  return <MeetingsView upcoming={upcoming.data} />;
}
