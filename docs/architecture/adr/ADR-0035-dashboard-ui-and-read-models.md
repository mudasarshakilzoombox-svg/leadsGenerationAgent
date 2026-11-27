# ADR-0035: Dashboard UI, read-only data endpoints and the admin shell

- **Status:** Accepted · **Date:** 2026-11-27 · **Amends:** 01-frontend.md §3 (routes, component location), ARCHITECTURE.md §8.1 and §9.2

## Context
The request was for a professional dashboard with:
- 13 sections: Overview, Find Leads, Companies, Contacts, Lead Lists, ICP Builder, Campaigns, Inbox, Meetings, Integrations, Analytics, Billing, Settings;
- a separate platform admin interface;
- every button either working or clearly disabled;
- loading, empty, error and success states on every screen;
- layouts that work on mobile, tablet and desktop.

Only the identity, workspace and team APIs existed. Most sections belong to Phases 1–6.

The owner chose two things:
- **Real read-only data:** read endpoints over the tables that already exist, with unbuilt actions disabled.
- **The admin shell now:** platform data stays locked until the MFA-protected admin API exists (SECURITY.md §3.4).

## Decision

### Read models (API)
- Plain GET endpoints under `/workspaces/:workspaceId/…`:
  - `overview`, `analytics`;
  - `leads`, `companies[/:id]`, `contacts[/:id]`, `lead-lists[/:id]`, `icps`;
  - `campaigns[/:id]`, `conversations[/:id]`, `meetings`;
  - `integrations`, `billing`.
- Every route goes through `TenantGuard`. Membership is the read permission, so all four roles can read, including READ_ONLY. Other workspaces get 404.
- **Queries:** the tenant-scoped client only.
- **Lists:** cursor pagination with HMAC-signed keyset cursors. The key is derived from `SESSION_PEPPER`; a tampered cursor gets 400.
- **Credentials and mail bodies:** never selected. Email bodies are returned as plain text and rendered escaped.
- **Metrics:**
  - Formulas live once in `packages/contracts/src/metrics.ts` (11-analytics §3).
  - Rates use distinct enrollments and are computed for the whole range from `message_events`, never summed from daily values.
  - Days are bucketed in the workspace time zone.
  - BOUNCED events count as hard bounces.
  - Campaign list figures are lifetime totals; range figures live in Overview and Analytics.
- **Logic location:** `packages/core/src/modules/{insights,prospects,outreach,account}/*.queries.ts`.
- **Rollups:** this is acceptable at current volumes. The rollup tables (ADR-0025) replace the per-request aggregation when needed.

### Web
- **Routes:** flat, matching the sidebar: `/[workspaceSlug]`, `/find-leads`, `/companies`, `/contacts`, `/lead-lists`, `/icp`, `/campaigns`, `/inbox`, `/meetings`, `/integrations`, `/analytics`, `/billing`, `/settings`. They replace the nested `prospects/*`, `leads` and `settings/*` routes in the design.
- **Auth pages:** `(auth)/{login, signup, verify-email, forgot-password, reset-password, invitations/accept}`.
- **Admin:** `/admin/*`. The `/admin/queues` path is left to nginx.
- **Components:**
  - shadcn/ui primitives stay in `packages/ui`.
  - App composites live in `apps/web/src/components`: `states.tsx` (PRD §9 states, `ComingSoon`), `data.tsx` (`DataTable` that turns into cards below `sm`), `forms.tsx` (React Hook Form + contract Zod, API field-error mapping), and `charts/` (Recharts loaded through `next/dynamic`, each chart with a screen-reader table).
- **Data flow:** Server Components fetch the first page with `serverApi`. Client islands use TanStack Query with `initialData`, keyed `['ws', workspaceId, …]`. No Server Actions.
- **Unbuilt actions:** rendered by `ComingSoon`. It is visibly disabled, focusable, inert, and its tooltip names the roadmap phase.
- **Permission-dependent controls:** hidden or explained via `<Can>`. These checks are cosmetic; the API enforces.
- **Forms:**
  - `method="post"` everywhere, and submit buttons stay disabled until hydration. A pre-hydration click can never put credentials in a URL.
  - A full reload (`hardNavigate`) after a session change drops client caches.
- **Theme:** a zinc base with one emerald accent, from the product mark. Light, dark or system via `next-themes` with the CSP nonce. Geist is self-hosted (the `geist` package).
- **Turnstile:**
  - When `TURNSTILE_SITE_KEY` is set, the widget loads and the CSP allows `challenges.cloudflare.com`.
  - Otherwise the form sends a dev token, which only the fake verifier accepts.

### Admin shell
- Visible only to `SUPER_ADMIN`; everyone else gets 404. Desktop only.
- Each SA-01…06 page shows its intended columns or form with disabled controls and a "Requires Super Admin MFA" banner.
- `/auth/me` gains `user.isPlatformAdmin`. This is cosmetic: the future admin API enforces MFA, the IP allowlist and auditing.

### Dependencies
| Dependency | Licence | Purpose |
|------------|---------|---------|
| `@tanstack/react-query` | MIT | Named in 01-frontend |
| `react-hook-form`, `@hookform/resolvers` | MIT | Named in 01-frontend |
| `recharts` | MIT | Named in 01-frontend, lazy-loaded |
| `next-themes` | MIT | Named in 01-frontend |
| `sonner` | MIT | Toasts, ~3 kB |
| `geist` | OFL | Self-hosted fonts |

- Dev only: `@testing-library/*` and `jsdom@29` (supports Node 22.13+ and 24).
- Deferred: `next-intl` (English only for now) and TanStack Table, because `DataTable` covers current needs.

## Consequences
- ➕ Every section shows real, tenant-isolated data now. Later phases add writes behind the same screens.
- ➕ Disabled actions are honest about what doesn't exist yet. Nothing pretends to work.
- ➖ Read endpoints aggregate per request. Rollups and caching (11-analytics §4–5) are needed before large volumes.
- ➖ The admin UI shows no data until the admin API lands (Phase 6).

## Verification
- `apps/api/test/integration/dashboard/dashboard.int.test.ts` checks:
  - exact metrics;
  - pagination and tampered cursors;
  - no credential leakage;
  - READ_ONLY reads;
  - cross-tenant 404s.
- The route-security table covers the new GET routes.
- Web unit tests cover state components, `DataTable`, `<Can>`, field-error mapping, `safeNext` and `ApiError`.
- Headless browser QA at 1280, 768 and 360 px.
