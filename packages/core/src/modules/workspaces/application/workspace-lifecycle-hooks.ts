/**
 * Extension points for other modules when a workspace's lifecycle changes (ADR-0038). Phase 5
 * billing implements them: cancel the subscription at period end (PRD WS-07 AC2) and archive
 * financial records before the purge (DATABASE_DESIGN §8.1). Until then they do nothing.
 *
 * Hooks receive ids only and must be idempotent: a failed hook is retried by the next request or
 * the next purge run, never assumed done.
 */
export interface WorkspaceLifecycleHooks {
  /** After the deletion request commits. Failure is logged, not surfaced to the Owner. */
  onDeletionRequested(workspaceId: string): Promise<void>;
  /** After a restore commits. */
  onRestored(workspaceId: string): Promise<void>;
  /** Before any row is deleted. Throwing stops this purge run; the reconciler retries later. */
  beforePurge(workspaceId: string): Promise<void>;
}

export const WORKSPACE_LIFECYCLE_HOOKS = Symbol('WORKSPACE_LIFECYCLE_HOOKS');

export class NoopWorkspaceLifecycleHooks implements WorkspaceLifecycleHooks {
  async onDeletionRequested(): Promise<void> {}
  async onRestored(): Promise<void> {}
  async beforePurge(): Promise<void> {}
}
