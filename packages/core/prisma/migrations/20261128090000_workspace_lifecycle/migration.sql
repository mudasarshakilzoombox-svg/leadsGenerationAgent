-- P0.4: workspace lifecycle (PRD WS-07, ADR-0038). Additive only.
-- Restore puts back the status the workspace had when the Owner asked for deletion.
ALTER TABLE "workspaces" ADD COLUMN "status_before_deletion" "workspace_status";

-- The workspace-purge-due reconciler scans only workspaces waiting for deletion.
CREATE INDEX "workspaces_purge_due_idx" ON "workspaces"("purge_after") WHERE status = 'PENDING_DELETION';
