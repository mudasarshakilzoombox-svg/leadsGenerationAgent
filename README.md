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
| `pnpm check` | format check + lint + typecheck + unit tests |
| `pnpm format` | Prettier |
| `pnpm db:migrate` | Create/apply a migration in development (`prisma migrate dev`) |
| `pnpm db:deploy` / `pnpm db:status` | Apply pending migrations / show status |
| `pnpm db:seed` | Sync plan/role catalogs and load idempotent development data (refused when `APP_ENV=production`; `--catalogs-only` is what deploys run) |
| `pnpm infra:up` / `infra:down` | Start/stop local services (data is kept) |
| `pnpm stack:build` / `stack:up` / `stack:smoke` / `stack:down` | Full production-like Docker stack behind nginx on http://localhost:8080 |

`pnpm infra:reset` deletes local database and Valkey data. Only run it on purpose.

## How the foundation fits together

- **Configuration** is validated with Zod at process start (`packages/core/src/config/env.ts`, `apps/web/src/env-schema.ts`). A bad config exits with the variable names (never values).
- **Logging** is structured JSON (pino) with request ids and redaction of personal data and secrets. `LOG_PRETTY=true` locally.
- **Errors** leave the API as RFC 9457 `application/problem+json` with stable codes (`packages/contracts/src/errors.ts`).
- **Health:** `/health/live` (process up) and `/health/ready` (database, migrations, Valkey). The worker's readiness also requires a recently processed BullMQ heartbeat job.
- **CSRF:** state-changing API requests need the app `Origin` and `X-Requested-With: lga-web`.
- **Database roles:** migrations run as the schema owner. The apps connect as a DML-only role.

## CI

`.github/workflows/ci.yml` runs format check, build, lint, typecheck, unit tests, migrations and integration tests (PostgreSQL + Valkey services), a dependency audit, and Docker builds for all images.
