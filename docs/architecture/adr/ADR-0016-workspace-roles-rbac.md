# ADR-0016: Three workspace roles with permission-based RBAC

- **Status:** Accepted, amended by [ADR-0034](ADR-0034-auth-implementation-and-read-only-role.md) (adds the `READ_ONLY` role) · **Date:** 2026-11-26 · **Maps to:** AD-17, PRD §4

## Context
The PRD defines Platform Super Admin, Workspace Owner, Workspace Admin and Team Member. Future roles (Viewer/Client) and possibly custom roles must not require rewriting checks.

## Decision
- Workspace roles: `OWNER` (exactly one, enforced by a partial unique index), `ADMIN` and `MEMBER`. `SUPER_ADMIN` is a **platform** role with no implicit workspace membership. It reaches workspace data only via audited, time-boxed, read-only impersonation.
- Code checks **permissions** (`@RequirePermission('campaigns.approve_launch')`), never role names. Roles map to permission sets defined once (SECURITY.md §3.2).
- Permissions are resolved per request from `memberships` (30 s cache keyed by membership version), so role changes apply immediately.

## Alternatives considered
- **Role checks in code (`if role === 'ADMIN'`):** brittle when adding roles.
- **Full ABAC/policy engine (OPA, Cedar):** powerful but unnecessary now.

## Consequences
- ➕ Adding Viewer/Client or custom roles is a data and mapping change.
- ➖ The matrix must stay in sync with the PRD. A generated test enforces it.

## Verification
The role × permission matrix test is generated from the mapping. The route decorator lint. Impersonation write-block tests.
