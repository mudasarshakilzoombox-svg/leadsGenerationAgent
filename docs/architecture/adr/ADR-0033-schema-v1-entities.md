# ADR-0033: Schema v1 entities, catalog tables and tenant-safe delete policies

- **Status:** Accepted · **Date:** 2026-11-26 · **Amends:** DATABASE_DESIGN.md §2–§6 (names and delete policy), 04-database.md §4 (extension details), ARCHITECTURE.md §19 item 11 (plans as config only)

## Context
The first implemented schema was requested with a specific entity list (User, Session, VerificationToken, PasswordReset, Workspace, WorkspaceMember, Role, Invitation, Plan, Subscription, Entitlement, UsageLedger, PaymentEvent, BusinessProfile, WebsiteAnalysis, ICP, TargetSegment, Company, Contact, Lead, LeadList, LeadActivity, LeadScore, DataSource, ProviderConnection, ImportBatch, Campaign, CampaignStep, CampaignRecipient, Message, MessageEvent, Suppression, Unsubscribe, InboxConnection, Conversation, ReplyClassification, CalendarConnection, Meeting, WebhookEvent, AuditLog, BackgroundJob). Several names differ from DATABASE_DESIGN.md. Some entities (Plan, Role, BackgroundJob, DataSource) are not in the design at all.

## Decision

**Names.** The requested names are authoritative. `packages/core/prisma/schema.prisma` is the source of truth for table and column names:

| Implemented model (table) | Design name |
|---------------------------|-------------|
| `WorkspaceMember` (`workspace_members`) | `memberships` |
| `VerificationToken` + `PasswordReset` | `user_tokens` |
| `UsageLedger` (`usage_ledger`) | `usage_records` |
| `WebsiteAnalysis` (`website_analyses`) | `analysis_runs` |
| `TargetSegment` (`target_segments`) | `icp_personas` |
| `CampaignRecipient` (`campaign_recipients`) | `campaign_enrollments` |
| `Conversation` (`conversations`) | `email_threads` |
| `Message` (`messages`) | `email_messages` |
| `MessageEvent` (`message_events`) | `email_events` |
| `InboxConnection` (`inbox_connections`) | `mailboxes` |
| `ProviderConnection` (`provider_connections`) | `integration_connections` |
| `ImportBatch` (`import_batches`) | `imports` |
| `DataSource` + `FieldProvenance` | `data_provenance` |

These integrity tables were added alongside the requested list: `AuthIdentity`, `CreditGrant`, `Offering`, `LeadListMember`, `FieldProvenance`, `CampaignMailbox`, `CampaignApproval`, `MessageDraft`, `SendingDomain`. Later-phase tables (AI runs, research facts, tasks, notifications, DSAR, rollups, MFA, API keys) arrive with their phase.

**Catalog tables synced from code.** `plans` and `roles` exist so that `workspaces.plan_key`, `subscriptions.plan_key`, `workspace_members.role_key` and `invitations.role_key` have real foreign keys and plan history. The code stays the source of truth: `platform/billing/plans.ts` (PRD §8) and `platform/tenancy/permissions.ts` (SECURITY.md §3.2). `syncCatalogs()` upserts them. It runs in the migrate container after `prisma migrate deploy` and in `pnpm db:seed`. Permission checks always use the code matrix, never the `roles.permissions` column.

**Provenance.** `DataSource` is one acquisition: an import batch, a provider call, an enrichment or a manual edit. It carries provider, lawful basis, retrieval time and cost. `FieldProvenance` maps (record, field) to the source that last supplied it, with an external record id and a value hash. A CHECK ensures each row targets exactly one company or contact. This answers GDPR Art. 14 "where did you get my data" per field.

**BackgroundJob.** This is the DB record of long-running async work (ADR-0005). It holds status, attempts, heartbeat and progress for reconcilers and progress UI. BullMQ remains the transport. `workspace_id` is nullable for platform jobs.

**Delete policies.**
- `workspace → rows`: CASCADE (purge path only; the app soft-deletes first).
- Owned children: CASCADE.
- **Cross references use NO ACTION, not RESTRICT.** NO ACTION is checked at the end of the statement, so it blocks deleting a referenced row on its own but still lets the single workspace purge cascade through every table. RESTRICT is checked immediately and would block the purge.
- **No SET NULL on composite foreign keys.** It would null `workspace_id` as well. Optional tenant links use NO ACTION. Only single-column links to global `users` use SET NULL.

**Soft delete.** `deleted_at` + partial uniques `WHERE deleted_at IS NULL` on users, workspaces, business_profiles, icps, companies, contacts, lead_lists, campaigns and inbox_connections. Erasure (DSAR) is always a hard delete.

**Partial indexes in the schema.** The Prisma `partialIndexes` preview feature (7.10) declares partial uniques and indexes in `schema.prisma`, so `migrate diff` reports no drift. Predicates are written with `=`/`OR`, not `IN (...)`. PostgreSQL rewrites `IN` to `= ANY (ARRAY[...])`, which Prisma reports as drift. CHECK constraints and role grants are hand-written SQL in the migrations, which Prisma does not track.

**Append-only for the app role.** The migration revokes privileges discovered from table ACLs, so the role name is not hard-coded:
- `audit_logs`: UPDATE and DELETE (INSERT/SELECT only).
- `lead_activities`, `lead_scores`, `message_events`, `unsubscribes`, `payment_events`: UPDATE.
- `credit_grants`, `usage_ledger`: DELETE. These are updated on settle and release.

FK cascades run as the table owner, so the workspace purge is unaffected. The 24-month audit retention purge needs its own path, for example an owner-defined SECURITY DEFINER function. It will be built with the retention jobs.

**Tenant client (amends 04-database.md §4).**
- The schema is a single file for now.
- `MODEL_SCOPES` is typed `satisfies Record<Prisma.ModelName, ModelScope>`, so a new model fails typecheck until it is classified. A unit test also checks the classification and composite keys against `schema.prisma`. This replaces the planned `/// @tenant` generator.
- `createTenantClient(prisma, workspaceId)` ANDs the workspace into filter operations and extends unique selectors with `workspaceId` (Prisma extended where-unique) instead of rejecting non-compound selectors. Both are equally safe.
- It verifies `workspaceId` on writes and blocks global and system models.
- `WorkspaceAccessService.forUser()` is the only way application code obtains it.

## Consequences
- ➕ Cross-tenant references are impossible at the database level, including through raw SQL and nested writes. Integration tests prove it per model.
- ➕ Plan and role keys are referentially safe, while limits and permissions remain reviewable code.
- ➖ The catalogs must be synced on every deploy (done in the migrate container).
- ➖ Deleting a referenced row needs explicit ordering in services. That is intended: data is not deleted implicitly.
- ➖ Prisma's create types still require `workspaceId`. Repositories pass it explicitly, and the tenant client verifies it.

## Verification
- `packages/core/src/tenancy/*.test.ts` (classification, argument scoping).
- `packages/core/test/integration/tenant-isolation.int.test.ts`, `constraints.int.test.ts` and `seed.int.test.ts`.
- `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` reports no difference.
