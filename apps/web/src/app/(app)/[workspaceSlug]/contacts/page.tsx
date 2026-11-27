import { ContactItemSchema, Page } from '@lga/contracts';
import type { Metadata } from 'next';
import { ContactsView } from '@/features/records';
import { serverApi, wsPath } from '@/lib/api/server';
import { loadWorkspace } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Contacts' };

export default async function ContactsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { membership } = await loadWorkspace(params);
  const initial = await serverApi(
    wsPath(membership.workspace.id, 'contacts'),
    Page(ContactItemSchema),
  );
  return <ContactsView initial={initial} />;
}
