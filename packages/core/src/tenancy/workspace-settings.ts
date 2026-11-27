import { WorkspaceSettingsSchema, type WorkspaceSettings } from '@lga/contracts';

export type { WorkspaceSettings } from '@lga/contracts';

/**
 * Typed view of `workspaces.settings` (schema in @lga/contracts). Never throws: a malformed
 * field falls back to its safe default (for example launch approval stays ON).
 */
export function parseWorkspaceSettings(value: unknown): WorkspaceSettings {
  const parsed = WorkspaceSettingsSchema.safeParse(
    value && typeof value === 'object' && !Array.isArray(value) ? value : {},
  );
  return parsed.success ? parsed.data : WorkspaceSettingsSchema.parse({});
}
