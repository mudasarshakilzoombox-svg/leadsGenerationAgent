# ADR-0032: Repository layout with separate api and worker apps and a backend core package

- **Status:** Accepted · **Date:** 2026-11-26 · **Amends:** ADR-0001 (layout only), ADR-0002

## Context
ADR-0001 proposed one NestJS app (`apps/backend`) with two entrypoints. The approved implementation request asked for `apps/api`, `apps/worker`, and the packages `shared`, `contracts`, `config` and `ui`. Domain modules must be shared by both processes, because the API enqueues and reads and the worker processes.

## Decision
- `apps/api` (HTTP) and `apps/worker` (BullMQ + internal health server) are separate NestJS apps with separate Docker images.
- **`packages/core`** holds the backend code both share: env validation, logging, errors, Prisma schema, migrations and client, Valkey/BullMQ helpers, and health checks. Domain modules (services, repositories, domain logic) will live here too. Controllers live in `apps/api` and processors in `apps/worker`.
- `packages/contracts` holds Zod schemas used by web and backend. `packages/shared` holds isomorphic utilities. `packages/ui` holds shadcn/ui components. `packages/config` holds TS, ESLint and SWC presets.
- Everything is ESM (NestJS 12 ships ESM only). Production builds use `tsc`. Development uses SWC watch (low memory). Type checking resolves workspace packages to their sources through the `@lga/source` export condition.

## Consequences
- ➕ Still one modular monolith (one database, shared code, one repo). The process boundary is explicit in the folder structure.
- ➕ Each image contains only what its process needs.
- ➖ One more package boundary: domain code goes in `core`, not in the apps. Lint rules for module boundaries apply inside `core/src/modules` as domains are added.

## Verification
CI builds all images. Integration tests cover api and worker against real PostgreSQL and Valkey.
