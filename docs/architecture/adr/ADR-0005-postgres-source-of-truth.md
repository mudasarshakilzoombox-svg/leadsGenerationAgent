# ADR-0005: PostgreSQL as source of truth, DB-first jobs with reconcilers

- **Status:** Proposed · **Date:** 2026-11-26 · **Maps to:** AD-05

## Context
Sending email, charging credits and stopping sequences must never be lost or duplicated. Redis-compatible stores can lose recent writes, and queue state is not a ledger.

## Decision
All business and workflow state lives in PostgreSQL. A job is enqueued **after commit** (`TxManager.afterCommit`) and carries only IDs. Every async workflow has a DB status. **Reconcilers** (every 5 min) re-enqueue stale work. Multi-stage pipelines chain through DB statuses instead of BullMQ Flows. Idempotency is guaranteed by DB constraints (unique idempotency keys, exactly-once send constraints), with Valkey keys as a fast first line only.

## Alternatives considered
- **Transactional outbox table + relay:** stronger delivery guarantees, but more moving parts. Our status-based reconcilers give equivalent recovery for our workflows. We can revisit if event volume grows.
- **BullMQ Flows for pipelines:** rejected, because parent/child state lives in Valkey.
- **Valkey as the system of record for counters and limits:** rejected for correctness-critical values.

## Consequences
- ➕ Valkey loss costs only latency. Chaos-tested at Gate 3.
- ➕ Simple mental model: "if it isn't in Postgres, it didn't happen".
- ➖ Extra status columns and reconciler code per workflow.
- ➖ Up to a 5-minute recovery delay after an enqueue failure.

## Verification
Reconciler tests. The chaos test (kill worker + flush Valkey mid-send) shows zero duplicates and no lost sends.
