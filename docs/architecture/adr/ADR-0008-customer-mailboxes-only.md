# ADR-0008: Outreach only via customer mailboxes. SMTP/IMAP + Microsoft first

- **Status:** Proposed · **Date:** 2026-11-26 · **Maps to:** AD-08, AD-20

## Context
Bulk email providers (SES, SendGrid, Mailgun) prohibit cold outreach in their AUPs. VPS IPs have no sending reputation, and port 25 is often blocked. Gmail's restricted read scopes require Google verification plus a paid annual security assessment (CASA), which is costly and slow for a pre-revenue startup.

## Decision
- Outreach is sent **only** through mailboxes the customer connects and authenticates: **SMTP/IMAP** (any host, including Gmail/Google Workspace via app passwords) and **Microsoft 365 via Graph OAuth** at launch. **Gmail OAuth** is available only to allow-listed test users (Google testing mode) until verification and CASA are funded (V1).
- System mail (verification, resets, alerts) uses a transactional provider (SES or Resend) from `notify.<domain>` and can never address contacts.

## Alternatives considered
- **Platform-owned sending infrastructure:** high reputation risk, AUP violations, operational burden.
- **Gmail OAuth for everyone at launch:** blocked on CASA cost and timeline.
- **Gmail via IMAP OAuth (XOAUTH2):** uses the same restricted scope, so it doesn't avoid verification.

## Consequences
- ➕ No ESP AUP risk. Reputation belongs to the customer's domain. Zero platform sending cost.
- ➕ Launch is not blocked on Google.
- ➖ Gmail users face app-password setup friction. Mitigated by guides, presets and clear connection errors (ROADMAP R1).
- ➖ We must handle many SMTP and IMAP server quirks.

## Verification
The `notifications` module API accepts only `userId` recipients (type-level). Gate 3 dogfood across SMTP and Microsoft mailboxes.
