# ADR-0011: BYOK prospect data with provenance recording

- **Status:** Proposed · **Date:** 2026-11-26 · **Maps to:** AD-11, PRD D2

## Context
Contact-data providers generally forbid reselling or sharing their data without partner agreements. GDPR Art. 14 requires disclosing data sources to data subjects. Data costs are a significant risk for a startup.

## Decision
- Discovery, enrichment and email finding use the **customer's own provider account (BYOK)** or **CSV import** with a mandatory lawful-basis attestation. No platform-resold data at launch. These actions cost 0 platform credits.
- Every contact and company records **provenance** (`data_provenance`: provider, fields, time, run or import).
- Excluded sources: LinkedIn scraping or automation, purchased lists, SMTP mailbox probing.
- No cross-tenant sharing or caching of provider data.

## Alternatives considered
- **Platform-managed data credits:** smoother onboarding, but licensing, fraud and margin risk. Revisit with reseller agreements.
- **Own scraped database:** legal and ethical risk. Rejected.

## Consequences
- ➕ The customer is the licensee. Zero data cost risk. Clean Art. 14 disclosures.
- ➖ More onboarding friction (key setup). Mitigated by CSV import and guided connection.

## Verification
Gate 2: 100% provenance coverage. The provider evaluation checklist (INTEGRATIONS.md §10) is completed before each adapter.
