# ADR-0014: Polling-based inbox sync

- **Status:** Proposed · **Date:** 2026-11-26 · **Maps to:** AD-14

## Context
Reply detection must stop sequences quickly (≤ 5 min target) for up to 250 mailboxes. Push mechanisms (Gmail watch + Pub/Sub, Graph subscriptions with renewal, IMAP IDLE connections) add infrastructure and per-mailbox long-lived connections.

## Decision
Poll each mailbox every ~3 minutes via `inbox.sync-dispatch` (oldest-first, ≤ 50 per minute). Cursors: IMAP `UIDVALIDITY` + last UID, Graph `deltaLink`, Gmail `historyId`, with documented resync on cursor loss. Per-mailbox locks prevent overlapping syncs. `SendPolicy` SP-04 also re-checks for replies just before each send.

## Alternatives considered
- **Push notifications:** lower latency, but needs public subscription endpoints, renewal jobs and a GCP Pub/Sub project. Planned for later.
- **IMAP IDLE:** one TCP connection per mailbox. Too costly in memory and file descriptors on KVM 2.

## Consequences
- ➕ Simple, robust, no extra cloud services.
- ➖ Up to ~3–5 min latency. The SP-04 last-mile check closes most of the risk of sending after a reply.
- ➖ Steady API usage per mailbox (well within provider quotas).

## Verification
`inbox_sync_lag_seconds` SLO (99% ≤ 5 min). Tests for cursor loss and resync on all three providers.
