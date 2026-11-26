# ADR-0002: Monorepo with pnpm workspaces and Turborepo

- **Status:** Proposed · **Date:** 2026-11-26 · **Maps to:** AD-02

## Context
Frontend and backend must share validation schemas, enums, error codes and event names. A small team needs one place for CI, linting and versioning.

## Decision
A single repository with pnpm workspaces: `apps/web`, `apps/backend`, `packages/contracts`, `packages/config`. Turborepo orchestrates tasks with local caching (remote cache not needed). Node 24 LTS is pinned via `.nvmrc` and `engines`.

## Alternatives considered
- **Polyrepo:** rejected. It would need contract publishing and version skew management.
- **Nx:** capable, but heavier configuration than needed.
- **npm/yarn workspaces:** pnpm is faster and its strict dependency isolation avoids phantom dependencies.

## Consequences
- ➕ Atomic changes across web, backend and contracts. One PR, one CI run.
- ➕ `packages/contracts` gives end-to-end type safety without code generation.
- ➖ CI must be path-aware to stay fast (Turborepo `--filter` on changed packages).

## Verification
CI runs `turbo run lint typecheck test build`. A contract change breaks both consumers at compile time if incompatible.
