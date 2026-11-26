# ADR-0021: Application-level field encryption with versioned keys

- **Status:** Proposed · **Date:** 2026-11-26

## Context
OAuth refresh tokens, SMTP passwords, BYOK API keys, TOTP secrets and DSAR requester emails are high-value secrets (TM-12). The VPS disk isn't assumed to be encrypted, and backups or dumps could leak. A cloud KMS adds cost and dependency.

## Decision
`FieldCrypto`: AES-256-GCM with a random 96-bit IV per value and **AAD = `workspace_id ‖ row id`** (prevents swapping ciphertext between rows or tenants). Format `v{keyVersion}:{iv}:{tag}:{ciphertext}`. Keys are in `APP_ENCRYPTION_KEYS` (JSON map of version → 32-byte key) with `APP_ENCRYPTION_ACTIVE_VERSION`. Rotation adds a version, and `crypto.reencrypt` migrates rows. Decrypted values never leave the backend and are never logged.

## Alternatives considered
- **Disk encryption only (LUKS):** protects stolen disks, but not DB dumps, backups or SQL-level access.
- **pgcrypto in the DB:** keys would pass through SQL and logs.
- **Cloud KMS/HSM envelope encryption:** stronger key custody. Deferred for cost, and the interface allows adding it later.

## Consequences
- ➕ DB or backup theft alone doesn't reveal credentials.
- ➖ Full server compromise exposes env keys. Mitigated by hardening and the rotation runbook.

## Verification
Unit tests (tamper detection, AAD mismatch, rotation). Restore tests decrypt sampled fields with the current key.
