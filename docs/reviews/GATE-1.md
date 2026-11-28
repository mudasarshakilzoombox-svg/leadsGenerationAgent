# Gate 1 review: end of Phase 0 (Foundations)

- **Date:** 2026-11-28 · **Prompts:** P0.1–P0.6 · **Branches:** `feat/security-utilities` …
  `feat/prod-ops` (stacked, not yet merged to `main`)
- **Source of the criteria:** ROADMAP Phase 0 "Exit criteria" and §3 Gate 1.

## Exit criteria

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Sign up, verify email, create workspace, invite, change roles, transfer ownership with correct permissions | **Done** | API integration suites (`apps/api/test/integration/auth/*`): RBAC matrix, cross-tenant 404s, recent-auth; Playwright auth flow |
| 2 | CI deploys via the staging stack to production | **Built, rehearsed locally; pending owner** | `.github/workflows/release.yml` + `infra/scripts/deploy.sh`. Local rehearsal 2026-11-28: staging deploy, production deploy, forced failure rolled back automatically (see below). The first real run needs `docs/OPS_SETUP.md` steps 1–6 |
| 3 | A worker job calls `AiGateway` and records cost | **Done** | `apps/worker/test/integration/ai-selftest.int.test.ts` (fake provider, `ai_runs` row with tokens and cost) |
| 4 | A backup is restored into a temporary container | **Done locally; pending for B2** | `infra/backup/restore-drill.sh`: restore 11 s, total 30 s, all checks PASS (`infra/runbooks/restore-log.md`). Repeat against B2 after OPS_SETUP step 7 |
| 5 | Conventions reviewed and approved | **Pending owner** | AGENTS.md, ADR-0032…0040, quality gates (ADR-0039) |
| 6 | Primary LLM chosen from the eval | **Owner chose OpenAI; real eval not run** | Routing in `packages/core/config/ai-routing.yaml`. Run `pnpm ai:eval system.selftest --provider openai` when you want the cost and quality numbers |
| 7 | Choose the first BYOK data provider and the verifier | **Pending owner** | LONG_LEAD_TASKS "First BYOK data provider account" (needed in Phase 2) |

## P0.6 evidence (2026-11-28)
- **Sentry scrubbing:** `packages/core/src/observability/sentry.test.ts` sends a real Sentry
  event to a local sink. A 500 whose message, context, query and cookie carried
  `jane.doe@example.com` arrived as `Database exploded while saving [EMAIL]` with release,
  environment and requestId tags, and no `example.com` anywhere. The 4xx `DomainError` was
  not sent.
- **Backup:** `backup.sh` against the dev database: 373 KB uploaded, age-encrypted
  (`age-encryption.org/v1` header), with manifest. With the wrong key the drill fails ("no
  identity matched") and cleans up.
- **Scripts:**
  - shellcheck: clean on every script;
  - `bootstrap-server.sh --dry-run` in `ubuntu:24.04`: exit 0;
  - `docker compose config`: valid for production, production with `ops`, VPS and staging;
    staging memory limits total 1,488 MB;
  - `alloy validate`: OK.
- **Deploy rehearsal** (`deploy.sh --local` with images freshly built from this branch, 2026-11-28):
  - **staging `r1`:** migrate plus seed, all three containers healthy, smoke (`/health/ready`,
    `/login` 200, cross-origin POST 403), then stopped. 1 min 36 s.
  - **production `r1`:** live. 1 min 10 s.
  - **production `r2` with `--force-unhealthy`:** failed the gate and **rolled back to `r1`
    automatically** (healthy, `/health/ready` version `r1`, state file `r1`), and exited 1 so CI
    flags it. 2 min 5 s.
  - **Catch:** the first staging attempt with week-old images failed the smoke test (`/login`
    404). The gate did its job.

## Follow-ups carried into Phase 1+
- Web source-map upload to Sentry (ADR-0040).
- `/metrics` endpoints and the API-level alerts in 12 §3/§6 (5xx rate, queue age) once Phase 2
  queues exist.
- `compliance.reapply-erasures` job for restores (13 §5, Phase 3).
- MFA, then the real platform-admin guard for Bull Board (P6.1).

## Decision
Gate 1 can be signed off when the owner has completed `docs/OPS_SETUP.md`, the first `v*` tag has
deployed through staging to production, and a drill against B2 has passed.

**Signed off by:** _pending_
