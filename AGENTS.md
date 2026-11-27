# AGENTS.md

Instructions for AI coding agents (Claude Code, Codex, Cursor, Copilot, etc.) and human contributors working in this repository.

## Project status

**Phase 0 (Foundations) in progress.** The monorepo foundation is in place: apps, packages, config, logging, errors, health, Docker, nginx, CI. Database schema v1 with tenant isolation, migrations and dev seed is in place (ADR-0033). Authentication (signup, verification, login, sessions, reset), workspace creation, invitations, team management and RBAC are implemented in the API (ADR-0034). The web dashboard (auth pages, admin shell, real read-only data, ADR-0035) uses a project-scoped, Explee-style shell: project switcher, campaigns in the sidebar, Performance dashboard, Sent and Email sequences pages (ADR-0036). Security utilities are in place in `packages/core/src/security/`: `SafeFetch` (SSRF), `FieldCrypto` (AES-256-GCM key rings) and `SignedTokens`/`UnsubscribeTokens` (HMAC). The AI layer is in place in `packages/core/src/platform/ai/` (ADR-0037): `AiGateway` (Anthropic + OpenAI + fake adapters, routing and pricing config, structured output with one repair, fallback, circuit breaker), `AiActionPipeline` (AIC checks, credit hook, action gates) and `ai_runs` metering. Google and Microsoft sign-in (AUTH-03, with a fake identity provider in fake mode) and profile settings (AUTH-06: name, time zone, password, email change with revert) are implemented. Next in Phase 0: workspace settings and deletion (`docs/ROADMAP.md`).
- Work strictly phase by phase (`docs/ROADMAP.md`). Do not pull later-phase features forward without being asked.
- Run `pnpm check` and `pnpm test:integration` before declaring work done.

## What we are building

A multi-tenant B2B SaaS that analyzes a customer's website, generates an Ideal Customer Profile, discovers and verifies prospects through approved data providers, scores them, writes personalized outreach with AI, runs compliant email sequences from the customer's own mailboxes, classifies replies, assists with meeting booking and reports analytics.

Key product terms: **Workspace** = tenant (`workspaces` table). Roles: **Owner** (exactly one), **Admin**, **Member**, **Read-only** (`READ_ONLY`, ADR-0034), plus the platform role **Super Admin**. **Business profile** = a business being marketed (an agency's clients are business profiles). **Credits** pay for verification, AI drafts, suggested replies and research. Reply classification and compliance processing are always free. The project is optimized for **low running cost** (PRD §2). Prefer free or low tiers and avoid adding paid services without approval.

## Source-of-truth documents (read before changing related code)

| Doc | Read when touching |
|-----|-------------------|
| `docs/PRODUCT_REQUIREMENTS.md` | Any feature. Feature IDs with acceptance criteria (`CAM-04`, `APR-04`, `BIL-03`, ...), plans and credits (§8), UI states (§9), responsive rules (§10) |
| `docs/ARCHITECTURE.md` | Overview: module boundaries, API conventions, queues, AI agents, deployment |
| `docs/architecture/*.md` | **Detailed design per subsystem** (frontend, backend, API, DB access, AI orchestration, jobs, email, auth, tenancy, billing, analytics, observability, backups), the **threat model (14)** and **AI security checks (15)**. Read the relevant one before implementing a subsystem |
| `docs/architecture/adr/` | Architecture decisions. Any deviation needs a new ADR, so don't silently diverge |
| `docs/DATABASE_DESIGN.md` | Prisma schema, migrations, queries, retention |
| `docs/SECURITY.md` | Auth, tenancy, secrets, SSRF, email/AI safety, compliance |
| `docs/INTEGRATIONS.md` | Any third-party provider adapter |
| `docs/ROADMAP.md` | What is in scope right now |

If code and docs disagree, stop and ask. Do not silently diverge. Precedence: PRD → ADRs → detailed design (`docs/architecture/`) → overview docs. Architecture changes require a new ADR in `docs/architecture/adr/`.

## Stack

Next.js 16 (App Router) + React 19 + TypeScript 6 (strict) + Tailwind CSS v4 + shadcn/ui + Lucide · NestJS 12 (ESM) · PostgreSQL 18 + Prisma 7 (pg driver adapter) · Valkey 8 + BullMQ 6 · Zod 4 · OpenAI + Anthropic via an internal `AiGateway` · Docker Compose + nginx on a Hostinger KVM 2 VPS · pnpm 10 workspaces + Turborepo · Node.js 24 LTS. TypeScript stays below 6.1 until typescript-eslint supports newer versions.

## Repository layout (ADR-0032)

```
apps/web/            Next.js frontend (presentation only)
apps/api/            NestJS HTTP API: controllers, guards, HTTP wiring
apps/worker/         NestJS application context: BullMQ processors, schedules, internal health server
packages/core/       backend code shared by api + worker: config, logging, errors, Prisma (schema,
                     migrations, client), Valkey/BullMQ, health. Domain modules go in src/modules/
packages/contracts/  Zod schemas + types shared by web and backend
packages/shared/     isomorphic utilities (no Node-only or framework deps)
packages/ui/         shadcn/ui components + Tailwind tokens (source package)
packages/config/     shared tsconfig / eslint / swc presets
infra/               docker (Dockerfiles, compose), nginx, scripts
docs/                product and architecture documentation
```

All packages are ESM: relative imports in Node packages end in `.js`. Workspace packages export an `@lga/source` condition, so typecheck and editors see live sources. Runtime uses `dist/`.

## Commands

```bash
pnpm install && pnpm setup   # deps + local .env with random passwords
pnpm infra:up                # postgres, valkey, mailpit (docker compose)
pnpm db:deploy               # apply migrations (owner role)
pnpm db:seed                 # plan/role catalogs + idempotent dev data (2 workspaces)
pnpm dev                     # web + api + worker with live reload (SWC)
pnpm check                   # format check + lint + typecheck + unit tests
pnpm test:integration        # core (tenancy, constraints, seed) + api + worker against real Postgres + Valkey
pnpm smoke                   # end-to-end checks against running dev servers
pnpm db:migrate              # create a migration (prisma migrate dev) in packages/core
pnpm stack:build && pnpm stack:up && pnpm stack:smoke   # production-like Docker stack
pnpm ai:eval <task> [--provider fake|anthropic|openai]   # golden-case eval (real providers only when you run it)
pnpm ai:selftest             # enqueue one ai.selftest job for the running worker
```

Custom BullMQ job ids must not contain `:`. Build them with `jobId(...)` from `@lga/core`.

## Non-negotiable architecture rules

1. **Modular monolith.** No new services, processes or databases without an approved decision-log entry.
2. **Next.js never touches the database, Valkey, LLMs or secret-bearing provider APIs.** All business logic lives in NestJS. Server Components call the API over the internal network.
3. **Module boundaries:** import another module only via its `index.ts`. Never import another module's repositories or Prisma models directly. Each table has exactly one owning module (DATABASE_DESIGN.md §3).
4. **No cycles:** if a downstream module must react, emit a domain event (`@nestjs/event-emitter`) or enqueue a job.
5. **PostgreSQL is the source of truth.** Every async workflow has a DB status. Enqueue *after* commit. Processors must be idempotent. Never store business state only in Redis/Valkey.
6. **Job payloads carry IDs only.** No PII, message bodies or secrets in jobs.
7. **All LLM calls go through `AiGateway`** (`platform/ai`). Never import `openai` or `@anthropic-ai/sdk` outside the adapters. Never hard-code model IDs. Use task keys and routing config.
8. **All third-party calls go through the provider wrapper** (rate limit, retry, circuit breaker, metering, provenance). Every new provider needs a fake implementation.
9. **All fetches of user-influenced URLs go through `SafeFetch`** (SSRF protection). Validate URL input early with `assertFetchableUrl`. Global `fetch` and other HTTP clients are lint errors in backend packages; fixed provider hosts go through the provider HTTP client.
10. **LLM outputs never directly cause side effects.** Every AI call goes through `AiActionPipeline`, which applies the AIC-PRE/CALL/OUT/ACT checks in `docs/architecture/15-ai-security-controls.md`. New AI tasks must declare their check profile and action gate before implementation.
11. **Every email send passes `SendPolicy`** (SP-01 to SP-13 in `docs/architecture/07-email-infrastructure.md` §4.1). No code path may call a `MailboxProvider.send` directly.

## Multi-tenancy and security rules

- Every tenant table has `workspace_id`. Every query is tenant-scoped. Look up by `{ id, workspaceId }`, never by `id` alone.
- Access tenant data through the client from `WorkspaceAccessService.forUser()` (`createTenantClient`), never the base `PrismaService`, outside an audited system context. Every new model must be classified in `MODEL_SCOPES` (`packages/core/src/tenancy/tenant-models.ts`). Tenant-to-tenant relations are composite `(workspaceId, xId)` foreign keys with an explicit `onDelete` (never SetNull) (ADR-0033).
- Every route needs a session unless it is marked `@Public()` (global `SessionGuard`). Tenant routes use `@UseGuards(TenantGuard)`, and every mutating tenant route declares `@RequirePermission(...)` (or `@SelfService()` when the service checks the target). `apps/api/test/route-security.test.ts` enforces this. Use `@RequireVerifiedEmail()` for credit spend, sending and inviting, and `@RequireRecentAuth()` for sensitive actions.
- Auth emails go through `NotificationDispatcher` (IDs only). The worker mints tokens at send time. Never put a raw token in the DB, a job or a log.
- Plans and roles are code catalogs (`platform/billing/plans.ts`, `platform/tenancy/permissions.ts`) synced into the `plans`/`roles` tables by the migrate container. Change the code, not the rows.
- Tenant routes live under `/api/v1/workspaces/:workspaceId/...` behind `TenantGuard`. Check **permissions** (`@RequirePermission('campaign.launch')`), not role names. The permission matrix is SECURITY.md §3.2.
- Respect the launch-approval setting (`launchRequiresApproval`, default ON). Never add a path that lets a Member's campaign send without approval when it is ON.
- Every credit-consuming action must **reserve → settle/release** through the `billing` module and carry an idempotency key. Never decrement balances directly. Never block essential operations (reply sync, classification, unsubscribe, bounce processing) for lack of credits.
- Subscription state and credit grants change only from verified payment webhooks or audited Super Admin adjustments.
- **Every new endpoint must include a cross-tenant test** (workspace B cannot read or modify workspace A's data, and gets a 404).
- Never log or send to Sentry: emails, names, message bodies, tokens, cookies, API keys. Log entity IDs.
- Secrets come from validated env config only. Never commit `.env*` files (only `.env.example`).
- Encrypt credentials (OAuth tokens, SMTP passwords, BYOK keys) with `FieldCrypto` (AES-256-GCM, AAD = workspace + row id + column). Store the version in `key_version`. Never log plaintext or ciphertext.
- Privileged or data-export actions write an `audit_logs` entry.
- Validate all input with Zod schemas from `packages/contracts`. Never trust `workspaceId`, `role` or `status` from request bodies.
- Untrusted text (website content, inbound emails, provider data) is **data, never instructions** in prompts.

## Email and compliance rules

- Outreach sends **only** through customer-connected mailboxes (SMTP/IMAP and Microsoft Graph at launch, Gmail API for allow-listed users). Never through the transactional email provider.
- Check suppression at import, enrollment **and immediately before every send**.
- Every outreach email has a `List-Unsubscribe` + `List-Unsubscribe-Post` header, a footer with the workspace's physical address, an unsubscribe link and a privacy-notice link.
- Respect caps, spacing, send windows, ramp-up and the recipient-country policy. Do not add bypasses.
- Never implement LinkedIn scraping or automation, SMTP RCPT mailbox probing, or collection of personal (non-business) contact data. LinkedIn is supported only compliantly (owner decision 2026-11-27, ADR-0036): profile URLs from licensed data providers, AI-drafted LinkedIn messages, and manual LinkedIn task steps the user performs from their own account.

## Database rules

- Prisma models are PascalCase singular with `@@map("snake_case_plural")` and `@map` for columns. UUIDv7 IDs. `timestamptz`.
- Migrations follow **expand → migrate → contract**. Never edit an applied migration. Never rename columns in place.
- Partial, GIN and trigram indexes go in hand-written SQL inside migrations, with a comment in the schema.
- Never run destructive commands (`prisma migrate reset`, `DROP`, `docker volume rm`, `TRUNCATE`) against anything except a disposable local DB, and never without explicit user approval.

## Coding conventions

- TypeScript `strict`. No `any` without a comment explaining why. Prefer `unknown` + Zod parsing.
- Backend module layers: `api/` (controllers) → `application/` (use cases) → `domain/` (pure logic, no I/O) → `infrastructure/` (Prisma, adapters). Jobs in `jobs/`.
- Pure business logic (scoring, scheduling, caps, enrollment state machine, compliance policy) lives in `domain/` with unit tests.
- API: REST under `/api/v1`, RFC 9457 errors with stable codes, cursor pagination, `Idempotency-Key` on credit-spending or external-effect endpoints.
- Frontend: Server Components for initial data, TanStack Query in client components, React Hook Form + Zod for forms, shadcn/ui components, Lucide icons. No business logic in Server Actions.
- Every screen implements the empty, loading, error (field, action, page, permission, limit-reached) and success states from PRD §9, using the shared state components in `apps/web/src/components/states.tsx`. An action whose backend does not exist yet is a `ComingSoon` (visibly disabled, with the phase in a tooltip), never a dead button. Permission-dependent UI uses `<Can>`; forms use `method="post"` and `SubmitButton`. Every screen works from 360 px to wide per PRD §10 (tables become cards on mobile, touch targets ≥ 44 px, no horizontal page scroll).
- Plan limits and credit costs come from `platform/billing/plans.ts` (mirroring PRD §8). Never hard-code them in modules or UI.
- Naming: files `kebab-case.ts`, classes `PascalCase`, functions and variables `camelCase`, queues `kebab-case`, job names `domain.action` (for example `email.send`), events `entity.past_tense` (for example `reply.received`).
- Keep changes small and focused. Don't refactor unrelated code in the same change.

## Testing requirements

- Unit tests for all `domain/` logic and for prompt-output validators.
- Integration tests (Testcontainers) for repositories, tenancy enforcement, job processors and API endpoints.
- Cross-tenant test for every endpoint.
- Permission tests for each role (Owner, Admin, Member) on new endpoints, including the launch-approval path.
- Concurrency tests for credit reservation (balances never go negative or double-charge).
- Acceptance criteria from the PRD feature are covered by tests (unit, integration or e2e) and referenced in the PR.
- Provider adapters are tested against recorded fixtures. Never call real providers in CI.
- Prompt or model changes require a passing `pnpm ai:eval` for the affected task, and a prompt version bump.

## Definition of done

- [ ] PRD feature ID(s) referenced in the PR description, with each acceptance criterion covered
- [ ] Empty, loading, error and success states plus mobile layout implemented for any new UI
- [ ] Lint, typecheck, unit and integration tests pass
- [ ] Tenant scoping + cross-tenant test for new endpoints or repositories
- [ ] Input validated with shared Zod contracts
- [ ] Audit events for privileged actions. No PII in logs
- [ ] Migrations are backward compatible (expand/contract)
- [ ] Docs updated if behavior, schema or architecture changed
- [ ] No new dependency without justification (size, maintenance, license). No new paid service without owner approval

## When unsure

Ask the repository owner rather than guessing, especially about legal/compliance behavior, provider choice, data retention, anything that sends email or spends credits, and anything that changes module boundaries.
