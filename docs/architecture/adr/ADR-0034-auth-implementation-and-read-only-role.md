# ADR-0034: Authentication implementation choices and the READ_ONLY workspace role

- **Status:** Accepted · **Date:** 2026-11-27 · **Amends:** ADR-0016 (roles), 08-authentication.md §4.1, §5, §6; ARCHITECTURE.md API catalogue

## Context
The approved request asked for registration, login, logout, email verification, password reset, secure sessions, workspace creation, invitations, team management and RBAC with four roles: OWNER, ADMIN, MEMBER and **READ_ONLY**. The docs defined three roles. READ_ONLY was listed only as a future "Viewer/Client". The docs also disagreed on several details (listed below), which had to be settled to implement the feature.

## Decision

### READ_ONLY role
- READ_ONLY is a fourth workspace role. Membership already grants reading workspace data, and READ_ONLY's only permission is `analytics.view`.
- Every other permission is a change, a credit spend or a sensitive read (`contacts.export`, `audit.view`). So READ_ONLY cannot change anything, spend credits, export or read the audit log. A new write permission is denied to READ_ONLY by default.
- It can be granted by invitation or role change. OWNER is never assignable that way; only ownership transfer creates an Owner.
- The future Viewer/Client role (analytics only, optionally limited to business profiles) stays future.

### Settled doc conflicts

| Topic | Decision |
|-------|----------|
| Session at signup vs enumeration-safe signup | Signup returns `202` and no cookie, for new and existing emails alike. Verifying the email creates the session. Unverified users can still log in (AUTH-02 AC3). |
| Verification by `GET ?token=` | `POST /auth/verify-email {token}`. GET requests never change state; the web page posts the token from the URL. |
| Raw tokens vs IDs-only job payloads | The `notify.email` worker job carries IDs only and **mints the token at send time**. Each send replaces the previous token, so only the newest link works. Invitations are created with a placeholder hash that the worker rotates. |
| Rate limits (PRD 5/h signup, 3/h resend vs 03-api 10/min) | Both apply: 10 requests/min per IP on every public auth endpoint, plus the stricter per-flow limits. |
| 60 s session cache vs "revocation and role changes are immediate" | Every revocation deletes the Valkey entry. Permissions are not cached; one membership lookup per request. |
| Session hash | `sha256(token ‖ SESSION_PEPPER)`. Email tokens are `sha256(token)`. |
| Invitations path | `/workspaces/:workspaceId/invitations`. Accept and lookup are token-based: `/invitations/accept`, `/invitations/lookup`. |
| Admins managing Admins | Owner and Admin can change roles among ADMIN, MEMBER and READ_ONLY, and remove anyone except the Owner. Any non-Owner can leave. |
| Transactional email vendor | One SMTP adapter (`nodemailer`): Mailpit locally, the SES or Resend SMTP endpoint in production via `SMTP_URL`. No vendor SDK. |
| Soft-lock "unlock" link | 20 failures in 24 h lock sign-in for 1 h and email the owner. A password reset unlocks the account. |
| Progressive delay | No server-side sleeping. After the 5th failure in 15 min, attempts get `429` with `Retry-After` (1, 2, 4 … 30 s). The counters are keyed by an HMAC of the email, so unknown emails behave identically. |
| Bot check outage | Turnstile fails **closed**. HIBP fails **open** (SECURITY.md §3.1). In fake mode, Turnstile accepts any token except `fake-fail`, and HIBP uses a small fixed list. |

### Placement (ADR-0032)
- Logic lives in `packages/core/src/modules/`:
  - `identity`: domain, infrastructure, application.
  - `workspaces`, `notifications`, `audit`.
- HTTP lives in `apps/api/src/auth` and `apps/api/src/workspaces`:
  - `SessionGuard` is global and default-deny, with `@Public()` to opt out.
  - `TenantGuard` resolves `WorkspaceAccessService` and checks `@RequirePermission`.
  - `@RequireVerifiedEmail` and `@RequireRecentAuth` mark the stricter routes.
- The worker consumes the `notifications` queue.

## Consequences
- ➕ Account enumeration is closed on signup, login, verification resend, reset and invitations. Raw tokens never touch the database, the queue or logs.
- ➕ Removal and role changes take effect on the next request.
- ➕ Adding a write permission cannot accidentally grant it to READ_ONLY.
- ➖ The HIBP and Turnstile adapters call `fetch` directly (timeouts, fail-open and fail-closed). They move behind the provider wrapper when it lands (AGENTS.md rule 8).
- ➖ Members, invitations and sessions lists are not cursor-paginated yet. They are bounded by the seat limit and active sessions.
- ➖ Seats count READ_ONLY members like any other member.

## Verification
- Integration suites in `apps/api/test/integration/auth/`: signup and verification, login and sessions, password reset, workspaces and members (RBAC matrix × 4 roles, cross-tenant, status restriction), and invitations.
- The route-table test `apps/api/test/route-security.test.ts`.
- `apps/worker/test/integration/notifications.int.test.ts`.
- Unit tests for the identity domain, the adapters and the permission matrix.
