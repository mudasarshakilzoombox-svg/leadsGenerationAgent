# ADR-0006: Shared-schema multi-tenancy (workspace_id, composite FKs, RLS later)

- **Status:** Proposed · **Date:** 2026-11-26 · **Maps to:** AD-06, AD-16

## Context
Thousands of small tenants on one database. Cross-tenant leakage is the most severe risk (TM-01). Agencies need per-client separation but not separate logins in MVP.

## Decision
- **Workspace is the only tenancy level.** Agency clients are `business_profiles` inside a workspace.
- Every tenant table has `workspace_id`. Isolation is enforced in layers: path-scoped routes + `TenantGuard` → `RequestContext` → `TenantPrisma` extension (auto-scoping, compound unique selectors required) → **composite foreign keys `(workspace_id, fk)`** → PostgreSQL RLS on high-risk tables in V1.
- Cross-tenant access only through `withSystemContext(reason)` from allowlisted code.

## Alternatives considered
- **Schema-per-tenant or DB-per-tenant:** strong isolation, but migrations and connections across thousands of schemas are impractical on one VPS.
- **Organization → workspace hierarchy:** more flexible for agencies, but doubles authorization complexity now. A future Viewer/Client role can be scoped to business profiles instead.
- **RLS from day one:** adds per-transaction settings and debugging overhead before the app layer is stable. Deferred to V1 as defense in depth.

## Consequences
- ➕ Cheap, scalable, simple migrations.
- ➕ Composite FKs make cross-tenant references impossible even when the app has bugs.
- ➖ Isolation depends on code discipline until RLS. Mitigated by generated cross-tenant tests and lint.

## Verification
Generated cross-tenant API suite, repository suite, FK violation tests, `tenant_context_violations_total` alert.
