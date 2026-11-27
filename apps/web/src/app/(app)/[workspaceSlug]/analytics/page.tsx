import { AnalyticsSchema, RangeKeySchema } from '@lga/contracts';
import type { Metadata } from 'next';
import { AnalyticsView } from '@/features/account';
import { serverApi, wsPath } from '@/lib/api/server';
import { loadWorkspace } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Analytics' };

export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { membership } = await loadWorkspace(params);
  const range = RangeKeySchema.catch('30d').parse((await searchParams).range);
  const data = await serverApi(
    wsPath(membership.workspace.id, `analytics?range=${range}`),
    AnalyticsSchema,
  );
  return <AnalyticsView data={data} />;
}
