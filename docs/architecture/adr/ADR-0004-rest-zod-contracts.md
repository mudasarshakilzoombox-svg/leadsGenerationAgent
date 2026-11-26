# ADR-0004: REST with shared Zod contracts and generated OpenAPI

- **Status:** Proposed · **Date:** 2026-11-26 · **Maps to:** AD-04

## Context
We need typed client-server contracts, runtime validation at the boundary, and a path to a public API later.

## Decision
REST/JSON under `/api/v1`. Zod schemas in `packages/contracts` define every request and response. They are validated by a global `ZodValidationPipe` (strict objects) and parsed by the web client. OpenAPI 3.1 is generated from the schemas (exposed in non-production only). Errors follow RFC 9457 with a stable error code catalog. Cursor pagination, `Idempotency-Key` and `If-Match` follow [03-api.md](../03-api.md).

## Alternatives considered
- **tRPC:** great DX, but couples clients to TypeScript and is a poor fit for a public API.
- **GraphQL:** flexible, but harder per-field authorization, caching and rate limiting. More attack surface.
- **Class-validator DTOs:** duplicates schemas between web and backend.

## Consequences
- ➕ One schema validates both sides. Unknown fields are rejected (blocks mass assignment).
- ➕ The public API later reuses the same controllers.
- ➖ The REST endpoint surface grows. Mitigated by the endpoint catalog and conventions.

## Verification
Contract tests use the same schemas. The OpenAPI diff is reviewed in PRs. Problem+json shape tests.
