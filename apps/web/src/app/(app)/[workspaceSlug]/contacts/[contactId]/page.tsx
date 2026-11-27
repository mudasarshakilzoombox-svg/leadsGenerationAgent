import { ContactDetailSchema } from '@lga/contracts';
import type { Metadata } from 'next';
import { ContactDetailView } from '@/features/records';
import { loadDetail } from '@/lib/load-detail';

export const metadata: Metadata = { title: 'Contact' };

export default async function ContactPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; contactId: string }>;
}) {
  const contact = await loadDetail(params, (p) => `contacts/${p.contactId}`, ContactDetailSchema);
  return <ContactDetailView contact={contact} />;
}
