import { WorkspaceSummarySchema } from '@lga/contracts';
import type { Metadata } from 'next';
import { z } from 'zod';
import { SettingsView } from '@/features/settings';
import { serverApi } from '@/lib/api/server';
import { loadWorkspace } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Settings' };

const WorkspaceWithRole = WorkspaceSummarySchema.extend({
  roleKey: z.string(),
  permissions: z.array(z.string()),
});

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { membership } = await loadWorkspace(params);
  const workspace = await serverApi(
    `/api/v1/workspaces/${membership.workspace.id}`,
    WorkspaceWithRole,
  );
  return <SettingsView workspace={workspace} />;
}
