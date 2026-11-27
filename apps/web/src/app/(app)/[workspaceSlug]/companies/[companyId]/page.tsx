import { CompanyDetailSchema } from '@lga/contracts';
import type { Metadata } from 'next';
import { CompanyDetailView } from '@/features/records';
import { loadDetail } from '@/lib/load-detail';

export const metadata: Metadata = { title: 'Company' };

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; companyId: string }>;
}) {
  const company = await loadDetail(params, (p) => `companies/${p.companyId}`, CompanyDetailSchema);
  return <CompanyDetailView company={company} />;
}
