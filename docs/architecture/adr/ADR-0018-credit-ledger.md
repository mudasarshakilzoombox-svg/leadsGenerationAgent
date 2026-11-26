# ADR-0018: Credit ledger with grants, reservations and millicredits

- **Status:** Proposed · **Date:** 2026-11-26 · **Maps to:** AD-19, PRD §8, BIL-03

## Context
Credits come from several sources with different expiry rules (trial, monthly plan, 12-month packs, admin adjustments) and a defined spend order. Paid actions can fail after starting (provider errors, invalid AI output) and must not be charged. Concurrent workers must never overspend, and some actions cost fractions of a credit (0.2).

## Decision
- **Bucket ledger:** `credit_grants` (one row per grant with `remaining_millicredits`, `expires_at`, `source`). Debits are recorded in `usage_records` (`metric=CREDITS`).
- **Two-phase spend:** `reserve` (advisory lock per workspace, available = unexpired remainder − open reservations, insert `RESERVED` with a deterministic idempotency key) → `settle` (debit grants in spend order, record `grant_debits`) or `release`.
- Units are **millicredits** (`bigint`). The DB CHECK keeps balances ≥ 0. Reservations older than 1 h are released by a reconciler.
- Grants are idempotent on `(source, external_ref)`.

## Alternatives considered
- **Single balance column:** can't express per-grant expiry and spend order, and gives a poor audit trail.
- **Double-entry accounting tables:** more rigorous, but heavier than needed. The bucket ledger plus usage records is auditable enough for credits that aren't money.
- **Valkey counters:** fast but not durable (ADR-0005).

## Consequences
- ➕ Exact spend order and expiry. No charge on failure. Safe under concurrency.
- ➖ The per-workspace advisory lock serializes credit operations within a workspace (fine at expected rates).

## Verification
The concurrency test (50 parallel reserves against a 10-credit balance), spend-order unit tests, webhook replay tests (no double grants).
