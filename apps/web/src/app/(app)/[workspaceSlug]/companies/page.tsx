import { CompanyItemSchema, Page } from '@lga/contracts';
import type { Metadata } from 'next';
import { CompaniesView } from '@/features/records';
import { serverApi, wsPath } from '@/lib/api/server';
import { loadWorkspace } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Companies' };

export default async function CompaniesPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { membership } = await loadWorkspace(params);
  const initial = await serverApi(
    wsPath(membership.workspace.id, 'companies'),
    Page(CompanyItemSchema),
  );
  return <CompaniesView initial={initial} />;
}
