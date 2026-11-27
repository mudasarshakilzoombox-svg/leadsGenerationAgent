import { OverviewSchema, RangeKeySchema } from '@lga/contracts';
import type { Metadata } from 'next';
import { OverviewView } from '@/features/overview';
import { serverApi, wsPath } from '@/lib/api/server';
import { loadWorkspace } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Overview' };

export default async function OverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { membership } = await loadWorkspace(params);
  const range = RangeKeySchema.catch('30d').parse((await searchParams).range);
  const data = await serverApi(
    wsPath(membership.workspace.id, `overview?range=${range}`),
    OverviewSchema,
  );
  return <OverviewView data={data} />;
}
