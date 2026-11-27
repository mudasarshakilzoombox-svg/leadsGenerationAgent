import { LeadListDetailSchema } from '@lga/contracts';
import type { Metadata } from 'next';
import { LeadListDetailView } from '@/features/records';
import { loadDetail } from '@/lib/load-detail';

export const metadata: Metadata = { title: 'Lead list' };

export default async function LeadListPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; listId: string }>;
}) {
  const list = await loadDetail(params, (p) => `lead-lists/${p.listId}`, LeadListDetailSchema);
  return <LeadListDetailView list={list} />;
}
