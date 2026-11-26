# ADR-0001: Modular monolith with `api` and `worker` process roles

- **Status:** Proposed · **Date:** 2026-11-26 · **Maps to:** AD-01

## Context
A startup with 1–3 engineers, one VPS (2 vCPU, 8 GB) and one database. The domain has around 20 modules with heavy background processing (sending, syncing, AI). Microservices would multiply deployment, observability and consistency costs.

## Decision
One NestJS codebase and one Docker image with two entrypoints: `api` (HTTP) and `worker` (BullMQ processors and schedulers). Modules have strict boundaries (public `index.ts`, single table ownership, no cycles, enforced by dependency-cruiser). Each module splits into `*.module`, `*.http.module` and `*.jobs.module`, so each role loads only what it needs.

## Alternatives considered
- **Microservices:** rejected. Distributed transactions, network failure modes and ops cost are unjustified at this scale.
- **Single process (HTTP + jobs together):** rejected. Long jobs would hurt API latency and memory, and the two can't scale independently.
- **Separate repos per service:** rejected. Contract drift and duplicated tooling.

## Consequences
- ➕ Simple deploys, local transactions, one test suite, shared types.
- ➕ Workers can move to a second VPS without code changes (stateless).
- ➖ Requires discipline on boundaries (mitigated by CI rules).
- ➖ One bad dependency affects both roles (mitigated by Renovate and scans).

## Verification
dependency-cruiser rules in CI. Architecture review at each phase gate. Extraction candidates (`email-engine`, crawler) are reconsidered only on measured need (ARCHITECTURE.md §17.9).
