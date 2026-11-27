import { BillingSchema } from '@lga/contracts';
import type { Metadata } from 'next';
import { BillingView } from '@/features/account';
import { serverApi, wsPath } from '@/lib/api/server';
import { loadWorkspace } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Billing' };

export default async function BillingPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { membership } = await loadWorkspace(params);
  const data = await serverApi(wsPath(membership.workspace.id, 'billing'), BillingSchema);
  return <BillingView data={data} />;
}
