import { WorkspaceDetailSchema } from '@lga/contracts';
import type { Metadata } from 'next';
import { SettingsView } from '@/features/settings';
import { serverApi } from '@/lib/api/server';
import { loadWorkspace } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { membership } = await loadWorkspace(params);
  const workspace = await serverApi(
    `/api/v1/workspaces/${membership.workspace.id}`,
    WorkspaceDetailSchema,
  );
  return <SettingsView workspace={workspace} />;
}
