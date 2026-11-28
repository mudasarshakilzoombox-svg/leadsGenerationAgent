# Lead Generation Agent

AI lead generation and outreach SaaS. A modular monolith: Next.js web app, NestJS API and worker, PostgreSQL, Valkey + BullMQ.

- Product: [docs/PRODUCT_REQUIREMENTS.md](docs/PRODUCT_REQUIREMENTS.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/architecture/](docs/architecture/README.md)
- Rules for contributors and coding agents: [AGENTS.md](AGENTS.md)

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 24 LTS (22.12+ works) |
| pnpm | 10.34.9 (`npm i -g pnpm@10.34.9`) |
| Docker | Docker Desktop or Engine with Compose v2 |

## Quick start

```bash
pnpm install
pnpm setup            # creates .env with random local-only passwords (never committed)
pnpm infra:up         # PostgreSQL 18, Valkey 8, Mailpit (local ports only)
pnpm db:deploy        # apply migrations as the schema owner
pnpm db:seed          # plan/role catalogs + sample data (Acme Growth Agency, Northwind Startup)
# seeded users (e.g. olivia.owner@acme-growth.test) sign in with the dev-only password lga-local-dev-password
# existing checkout? `pnpm run setup --update` adds new variables (e.g. SESSION_PEPPER) to .env
pnpm dev              # web, api and worker with live reload
pnpm smoke            # end-to-end checks against the running dev stack
```

| Service | URL |
|---------|-----|
| Web | http://localhost:3300 |
| API | http://localhost:4000 (`/health/live`, `/health/ready`, `/api/v1/system/info`) |
| Worker health | http://localhost:4100/health/ready |
| Mailpit | http://localhost:8125 |

Ports are configurable in `.env` (`WEB_PORT`, `API_PORT`, `WORKER_HEALTH_PORT`, `POSTGRES_PORT`, `VALKEY_PORT`, `MAILPIT_*`).

## Repository layout

```
apps/
  web/        Next.js App Router (presentation only: no DB, no secrets)
  api/        NestJS HTTP API (/api/v1, RFC 9457 errors, health)
  worker/     NestJS application context + BullMQ workers (internal health server)
packages/
  core/       backend core shared by api + worker: env validation, logging, errors,
              Prisma (schema + migrations), Valkey/BullMQ, health checks
  contracts/  Zod schemas shared by web and backend (errors, health, jobs)
  shared/     isomorphic utilities (env parsing, redaction, helpers)
  ui/         shadcn/ui components and Tailwind v4 design tokens
  config/     TypeScript, ESLint, SWC presets
infra/
  docker/     Dockerfiles, compose.dev.yml, compose.prod.yml, Postgres init
  nginx/      edge proxy config (+ TLS example)
  scripts/    setup, dev runner, smoke test
docs/         product, architecture, ADRs
```

## Common commands

| Command | What it does |
|---------|-------------|
| `pnpm dev` | Low-memory dev loop: SWC watch for packages and backend apps, Next.js dev server. Apps restart once per change |
| `pnpm build` | Type-checked production builds (`tsc`, `next build`) |
| `pnpm lint` / `pnpm typecheck` | ESLint (type-aware) / TypeScript, all packages |
| `pnpm test` | Unit tests (no infrastructure needed) |
| `pnpm test:integration` | Core (tenant isolation, constraints, seed), API and worker against real PostgreSQL + Valkey (`pnpm infra:up` and `pnpm db:deploy` first) |
| `pnpm check` | format check + boundaries + lint + typecheck + unit tests (lint/typecheck/test run 2 packages at a time to fit an 8 GB laptop) |
| `pnpm dev:stop` | Stop leftover dev processes of this repo (`--dry-run` lists them). Matches by repo path and dev ports, never by name alone |
| `pnpm format` | Prettier |
| `pnpm db:migrate` | Create/apply a migration in development (`prisma migrate dev`) |
| `pnpm db:deploy` / `pnpm db:status` | Apply pending migrations / show status |
| `pnpm run setup --update` | Append variables that `.env.example` has and `.env` lacks (prints names only) |
| `pnpm db:seed` | Sync plan/role catalogs and load idempotent development data (refused when `APP_ENV=production`; `--catalogs-only` is what deploys run) |
| `pnpm infra:up` / `infra:down` | Start/stop local services (data is kept) |
| `pnpm stack:build` / `stack:up` / `stack:smoke` / `stack:down` | Full production-like Docker stack behind nginx on http://localhost:8080 |

`pnpm infra:reset` deletes local database and Valkey data. Only run it on purpose.

## Quality gates (ADR-0039)

| Command | What it checks |
|---------|----------------|
| `pnpm boundaries` | dependency-cruiser (`.dependency-cruiser.cjs`): modules import each other only through `index.ts`; `domain/` stays pure; the Prisma client stays in the data layer; the web app never imports backend packages; contracts/shared/ui stay isomorphic; no import cycles. Plus `infra/scripts/check-ownership.mjs`: only a table's owning module writes it (`MODEL_OWNERS`) |
| `pnpm secrets:scan` | gitleaks over the whole git history (`--staged` for staged changes), with a local `gitleaks` or the pinned Docker image |
| `pnpm openapi` | Regenerates `docs/api/openapi.json` from the contracts. CI fails when it is stale. Browse it at http://localhost:4000/api/docs (non-production) |
| `pnpm e2e` | Playwright against the running stack (`pnpm dev` first; `E2E_BASE_URL` to target another): auth + dashboard flows and axe accessibility checks on Desktop Chrome, Pixel 7 and iPhone 14 viewports (Chromium). `pnpm e2e:install` once for the browser, `pnpm e2e:ui` to debug |

**One-time setup:**
- **Secret scanning before each commit:** install gitleaks (`winget install gitleaks` or `brew install gitleaks`). The pre-commit hook installed by `pnpm install` then blocks commits that stage a secret. Without it the hook only warns; CI still scans every push.
- **Dependency updates:** install the free Renovate GitHub App on the repository (https://github.com/apps/renovate). `renovate.json` opens weekly grouped PRs, waits 14 days after a release and never auto-merges.

## How the foundation fits together

- **Configuration** is validated with Zod at process start (`packages/core/src/config/env.ts`, `apps/web/src/env-schema.ts`). A bad config exits with the variable names (never values).
- **Logging** is structured JSON (pino) with request ids and redaction of personal data and secrets. `LOG_PRETTY=true` locally.
- **Errors** leave the API as RFC 9457 `application/problem+json` with stable codes (`packages/contracts/src/errors.ts`).
- **Health:** `/health/live` (process up) and `/health/ready` (database, migrations, Valkey). The worker's readiness also requires a recently processed BullMQ heartbeat job.
- **CSRF:** state-changing API requests need the app `Origin` and `X-Requested-With: lga-web`.
- **Database roles:** migrations run as the schema owner. The apps connect as a DML-only role.

## Operations (ADR-0040)

| What | Where |
|------|-------|
| Owner setup (VPS, DNS, TLS, GitHub environments, B2, age key, Sentry, Grafana Cloud, UptimeRobot) | `docs/OPS_SETUP.md` |
| Release, rollback, restore, incidents | `infra/runbooks/` |
| Release pipeline (tag `v*`: build, scan, push to GHCR, staging, approval, production) | `.github/workflows/release.yml`, `infra/scripts/deploy.sh` |
| Server hardening | `infra/scripts/bootstrap-server.sh` (`--dry-run` to preview) |
| Stacks | `infra/docker/compose.prod.yml` (+ `compose.vps.yml` on the server, + `compose.staging.yml` for staging) |
| Backups and restore drill | `infra/backup/` (nightly `pg_dump`, age-encrypted, to B2 with object lock) |
| Logs and alerts | `infra/alloy/` (Grafana Alloy, alert rules as code) |

## CI

`.github/workflows/ci.yml` runs:
- **verify:** format check, build, architecture boundaries, OpenAPI drift, lint, typecheck, unit tests, migrations and integration tests (PostgreSQL + Valkey services), and a dependency audit;
- **secrets:** gitleaks over the full history;
- **e2e:** the built stack started once, then Playwright and axe on three viewports;
- **docker:** builds of all images.
