# ADR-0007: Opaque server-side sessions instead of JWTs

- **Status:** Proposed · **Date:** 2026-11-26 · **Maps to:** AD-07

## Context
The web app and API are same-origin (ADR-0003). We need immediate revocation (password reset, member removal, abuse), role changes that take effect at once, and no paid auth vendor.

## Decision
Backend-owned auth. A 256-bit random session token in the `__Host-lga_session` cookie (`HttpOnly; Secure; SameSite=Lax; Path=/`). Only a peppered SHA-256 hash is stored in `sessions`, with a Valkey cache of up to 60 s. Idle timeout 7 d, absolute 30 d. Rotation on login and privilege change. CSRF is handled by `OriginGuard` (Origin + `X-Requested-With`). Libraries: `@node-rs/argon2`, `openid-client` for Google/Microsoft OIDC, Cloudflare Turnstile for bot defense.

## Alternatives considered
- **JWT access + refresh tokens:** stateless, but revocation needs deny-lists, token storage in the browser is risky, and it gains nothing on the same origin.
- **Hosted auth (Clerk, Auth0):** fast to build, but per-MAU cost, vendor lock-in and a data processor for every user.
- **Auth library (Better Auth, Lucia-style):** viable. We chose a small in-house implementation for full control of tenancy-aware flows. Reconsider if scope grows (SSO, passkeys).

## Consequences
- ➕ Instant revocation. Simple CSRF. No tokens readable by JS.
- ➕ No auth vendor cost.
- ➖ We own security-critical code. Mitigated by well-reviewed libraries for primitives, an extensive flow test suite and a pen test in V1.

## Verification
Auth flow tests ([08-authentication.md](../08-authentication.md) §13). Revocation propagation within 60 s.
