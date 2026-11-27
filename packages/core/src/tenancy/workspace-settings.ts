import { z } from 'zod';

/** Typed view of `workspaces.settings`. Unknown keys are kept for forward compatibility. */
export const WorkspaceSettingsSchema = z.looseObject({
  /** PRD WS-06: Members need approval to launch. Defaults to ON. */
  launchRequiresApproval: z.boolean().default(true),
});
export type WorkspaceSettings = z.infer<typeof WorkspaceSettingsSchema>;

/** Never throws: malformed settings fall back to the safe defaults. */
export function parseWorkspaceSettings(value: unknown): WorkspaceSettings {
  const parsed = WorkspaceSettingsSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : WorkspaceSettingsSchema.parse({});
}
