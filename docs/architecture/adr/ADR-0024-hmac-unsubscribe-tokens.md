# ADR-0024: Stateless HMAC unsubscribe tokens with RFC 8058

- **Status:** Proposed · **Date:** 2026-11-26 · PRD SND-05

## Context
Unsubscribe must work with one click from mail clients (RFC 8058 `List-Unsubscribe-Post`), without login or JavaScript, indefinitely (CAN-SPAM requires at least 30 days), and resist forgery so attackers can't unsubscribe arbitrary people (TM-11).

## Decision
Token = `k{keyId}.{base64url(payload)}.{base64url(HMAC-SHA256(key, payload)[0..16])}` with payload `{v, workspaceId, contactId, campaignId, issuedAt}`. Tokens are verified statelessly with a constant-time compare and **don't expire**. Keys rotate by adding new key ids while old ones stay valid for verification. The links-domain endpoint `GET` shows a confirmation and `POST` applies the suppression idempotently. A mailto alternative goes to the sender's own mailbox and is recognized by inbox sync.

## Alternatives considered
- **Random tokens stored in the DB:** one row per sent email, which means more storage and lookups. Equivalent security.
- **Encrypted tokens (JWE):** unnecessary, because the payload isn't secret (only IDs) but must be unforgeable.

## Consequences
- ➕ No DB lookup to validate. Survives data restores. No enumeration.
- ➖ A key compromise allows forging unsubscribes (a fail-safe direction: it only stops email). Rotation handles it.

## Verification
Token forgery, tamper and rotation tests. An E2E test with Gmail and Outlook one-click.
