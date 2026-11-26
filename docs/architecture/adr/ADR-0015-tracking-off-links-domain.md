# ADR-0015: Tracking off by default. Separate links domain

- **Status:** Proposed · **Date:** 2026-11-26 · **Maps to:** AD-15, PRD D13

## Context
Open pixels and click redirects reduce deliverability, are unreliable (Apple Mail Privacy Protection) and raise privacy concerns. Any link domain shared by all tenants carries shared reputation risk.

## Decision
- Open and click tracking are **off by default**. A per-campaign toggle comes in V1 with a warning.
- Unsubscribe pages (and future click redirects) live on a **separate registrable links domain**, not the app domain. The session cookie is `__Host-` scoped, so it's never sent there.
- Per-workspace custom tracking domains are a Future option.

## Alternatives considered
- **Tracking on by default:** a common industry pattern, but it hurts our primary goal (replies).
- **Unsubscribe on the app domain:** abuse reports against the links could affect the app domain's reputation and safe-browsing status.

## Consequences
- ➕ Better deliverability and privacy. The app domain is isolated from outreach reputation.
- ➖ No open-rate metric in MVP. Reply rate is the KPI (PRD §13).
- ➖ One more domain to buy and monitor.

## Verification
Weekly safe-browsing and blocklist checks on the links domain. A MIME test asserts no tracking constructs when tracking is disabled.
