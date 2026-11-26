# ADR-0003: Next.js as a presentation layer, same-origin API, no BFF logic

- **Status:** Proposed · **Date:** 2026-11-26 · **Maps to:** AD-03

## Context
Next.js can run server code (Server Actions, Route Handlers) with direct DB access. Splitting business logic between Next.js and NestJS would duplicate authorization, tenancy and auditing.

## Decision
Next.js renders UI only. Server Components fetch from the NestJS API over the internal Docker network, forwarding the session cookie. Browsers call the same API same-origin (`/api/*` via nginx). No Server Actions with business logic, and no DB, Valkey, LLM or secret access in `apps/web`.

## Alternatives considered
- **Next.js as a BFF with its own logic:** rejected. Two places to enforce security.
- **Separate API subdomain with CORS + JWT:** rejected. It needs CORS, a token storage strategy and a wider CSRF surface.
- **SPA without SSR:** rejected. Worse first load on mobile and no streaming.

## Consequences
- ➕ One enforcement point for authZ and tenancy. Simple CSRF model (ADR-0007).
- ➕ The web container is small and stateless.
- ➖ An extra internal hop for SSR data (negligible on the same host).

## Verification
Lint bans server-only imports (`@prisma/client`, `ioredis`, provider SDKs) in `apps/web`. A CI check fails on unexpected `NEXT_PUBLIC_*` variables.
