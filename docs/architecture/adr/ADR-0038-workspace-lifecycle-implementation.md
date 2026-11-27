# ADR-0038: Workspace lifecycle, purge path, reconcilers and the Bull Board guard (P0.4)

- **Status:** Accepted · **Date:** 2026-11-27 · **Implements:** PRD WS-06, WS-07, ADR-0005, ADR-0033 · **Amends:** DATABASE_DESIGN §8.1 (financial records on purge), 09-multi-tenancy §7 (restore target)

## Context
P0.4 adds editable workspace settings, deletion with a 30-day restore window, a scheduled purge, a reusable reconciler framework and the Bull Board queue dashboard. The docs leave several points open or contradict each other:
- **Restore target status.** The 09 §7 lifecycle diagram only has `PENDING_DELETION → ACTIVE`, so a deleted trial would come back as a paid workspace.
- **Restricted writes.** TenantGuard blocks writes in `PENDING_DELETION` and `READ_ONLY`, but delete (from `READ_ONLY`) and restore are writes.
- **Restore permission.** No permission exists for restore.
- **Financial records.** DATABASE_DESIGN §8.1 keeps `credit_grants`, `usage_ledger` and `subscriptions` for 7 years. ADR-0033 cascades every workspace row on purge.
- **Purge method.** 04 §10 wants per-table batches, but the app role has no DELETE on the append-only tables.
- **Bull Board guard.** Bull Board needs a platform-admin guard (Super Admin + MFA + IP allowlist, 08 §10), and MFA does not exist yet.

## Decision
1. **Restore status.** A new nullable column, `workspaces.status_before_deletion`, records the status at deletion time. Restore puts it back; `ACTIVE` is used if the column is empty. Deletion is allowed from `TRIALING`, `ACTIVE`, `PAST_DUE` and `READ_ONLY`.
2. **Restricted-workspace exemption.** A route decorator, `@AllowRestrictedWorkspace()`, lets TenantGuard pass writes in restricted states. It is used only on `DELETE /workspaces/:id` and `POST /workspaces/:id/restore`.
3. **Permissions.** Restore reuses `workspace.delete` (Owner only) and needs no re-auth, because it is non-destructive. Delete needs `@RequireRecentAuth()` plus the exact workspace name (PRD WS-07 AC1).
4. **Settings concurrency (03-api §7):**
   - `GET` and `PATCH /workspaces/:id` return `ETag: W/"<row_version>"`, and `PATCH` requires `If-Match` (missing → 428, stale → 412).
   - `defaultSendWindow` and `launchRequiresApproval` live in `settings` JSON. The legal name, address, privacy link and time zone are columns.
   - `physical_address` shape: `{line1, line2?, city, region?, postalCode?, country (ISO alpha-2)}`.
   - Send window shape: `{days: 1..7[], start: "HH:MM", end: "HH:MM"}`; the default is Mon–Fri 09:00–17:00.
5. **Purge (owner decision, 2026-11-27: full purge plus a hook):**
   - `workspace.purge` first marks the workspace `CLOSED` with `deleted_at` set, so every member gets 404 and the slug is freed.
   - It then deletes rows in batches of 1,000, table by table, children before parents. The order is computed from the FK graph in `pg_catalog`, so new tables are covered without a hand-written list.
   - It skips append-only tables (the app role has no DELETE on them), tables on an FK cycle, and anything those tables reference.
   - Finally it deletes the `workspaces` row. Its `ON DELETE CASCADE` runs as the table owner and removes what is left. No SECURITY DEFINER function is needed.
   - Every step is idempotent, so a crashed run resumes on the next sweep.
   - A platform-level audit row (`workspace_id` NULL, `target_id` = the workspace) records the purge.
   - **Financial records are deleted with the workspace for now.** A `WorkspaceLifecycleHooks` port (`beforePurge`, `onDeletionRequested`, `onRestored`, with no-op defaults) is the documented hook. Phase 5 billing uses it to archive financial records before the purge and to cancel the subscription at period end (PRD WS-07 AC2). No real billing data exists before Phase 5.
6. **Reconciler framework:**
   - A reconciler implements `Reconciler { key, description, run(): {examined, acted} }` and is registered in `MaintenanceModule` (worker only).
   - A `reconcile.sweep` job on the new `maintenance` queue (concurrency 1) runs every 5 minutes. It is registered with `upsertJobScheduler` at worker start.
   - Each reconciler runs under its own Valkey lock (`lock:reconcile:<key>`, `SET NX PX`), so an overlapping sweep skips it. A failing reconciler does not stop the others.
   - First reconcilers:
     - `workspace-purge-due` enqueues `workspace.purge` with `jobId('workspace-purge', id)` for every workspace past `purge_after`, and for every interrupted purge.
     - `ai-run-payload-purge` clears `ai_runs` request and response payloads older than 30 days, as ADR-0037 promised.
7. **Bull Board (`@bull-board/api` and `@bull-board/express` 9.13.1, MIT):**
   - Mounted by the API at `/admin/queues`, behind a placeholder guard that lasts until P6.1. Access needs `platform_role = SUPER_ADMIN` and a client IP in `ADMIN_IP_ALLOWLIST`; an empty list means nobody.
   - `staging` and `production` always deny until MFA exists.
   - Everyone else gets a plain 404.
   - State-changing dashboard requests must be `Sec-Fetch-Site: same-origin`.
   - The board is built lazily on the first authorised request.
   - nginx keeps returning 404 for `/admin/queues` until P6.1 adds the real guard and the nginx allowlist.

## Consequences
- Deleted trials come back as trials, and the API can restore without a guard bypass anywhere else.
- Purge cost grows with data size but never takes long locks. A purge interrupted by a deploy simply resumes.
- Until Phase 5, a purged workspace leaves no financial history. That is acceptable only while no real payments exist. Phase 5 must implement `beforePurge` before billing goes live.
- Re-authentication still needs a password, so an OAuth-only Owner must set one before deleting (follow-up: OAuth step-up or MFA).
- New reconcilers are one class plus one line in `MaintenanceModule`.
