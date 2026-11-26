# ADR-0023: Exactly-once sending via deterministic Message-ID and DB constraints

- **Status:** Proposed · **Date:** 2026-11-26 · PRD SND-01 AC3

## Context
Sending the same cold email twice to a prospect damages the customer's reputation and trust. Workers can crash between the provider accepting a message and our DB commit. Queues can redeliver jobs. Plain SMTP servers often don't keep a copy in "Sent", so "not found in Sent" doesn't prove "not delivered".

## Decision
1. Deterministic BullMQ `jobId` `send_{enrollmentId}_{stepId}` (built with `jobId()`, because BullMQ rejects `:` in custom ids).
2. The scheduler sets `scheduled_send_at` under `FOR UPDATE SKIP LOCKED` (no double scheduling).
3. Before calling the provider, the processor creates `email_messages` (status `SENDING`) with a **pre-generated RFC `Message-ID`**. The partial unique index `(enrollment_id, step_id) WHERE direction='OUTBOUND' AND status<>'FAILED'` guarantees only one live send record.
4. After provider success, the status becomes `SENT`. For SMTP/IMAP mailboxes whose server doesn't save sent mail automatically (detected at connection time), we then `APPEND` the message to the IMAP Sent folder so the user sees it.
5. **Crash recovery prefers at-most-once.** A `SENDING` row older than 10 min is reconciled by searching sent items for the `Message-ID` (Graph `internetMessageId`, Gmail `rfc822msgid:`, IMAP `SEARCH HEADER Message-ID`):
   - Found: `SENT`.
   - Not found, and the provider reliably records sent mail (Graph, Gmail, SMTP hosts that auto-save to Sent): `FAILED`, eligible for rescheduling.
   - Not found on an SMTP host **without** reliable Sent copies: mark `SENT` with `delivery_unconfirmed = true` and continue the sequence. **Never resend when delivery is uncertain.**

## Alternatives considered
- **At-least-once with dedupe by recipient:** still risks duplicates in the crash window.
- **Provider idempotency keys:** not available for SMTP, and inconsistent across providers.

## Consequences
- ➕ No duplicates under Valkey loss, redelivery or worker crashes.
- ➖ In a rare crash window on SMTP hosts without Sent copies, one step may be recorded as sent although it wasn't delivered. This is accepted as a better outcome than a duplicate email, and it's visible via the `delivery_unconfirmed` flag.

## Verification
The Gate 3 chaos test (per provider kind). Unit tests for the reconciler decision table.
