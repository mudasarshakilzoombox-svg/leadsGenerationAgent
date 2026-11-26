# ADR-0027: Immutable encrypted backups. Point-in-time recovery in V1

- **Status:** Proposed · **Date:** 2026-11-26

## Context
A single VPS is a single point of failure. Ransomware or a compromised server could delete backups. Budget and complexity favor simple tools at launch.

## Decision
- **Launch:** nightly `pg_dump -Fc` streamed through `age` (public key only on the server) to an offsite S3-compatible bucket with **object lock / immutable retention** and **write-only** server credentials. Retention 35 daily, 12 weekly, 6 monthly. RPO 24 h / RTO 8 h.
- **V1 (or > 100 paying workspaces):** WAL-G continuous archiving + weekly base backups for point-in-time recovery (RPO 15 min / RTO 4 h).
- Monthly (later weekly) automated restore tests. Quarterly full DR drill. Erasures are re-applied after any restore.

## Alternatives considered
- **Hostinger snapshots only:** same provider and account, which is a single failure domain. Kept as an extra.
- **pgBackRest:** comparable to WAL-G. WAL-G chosen for its simple S3 integration.
- **PITR from day one:** more operational surface before it's needed.

## Consequences
- ➕ Cheap, ransomware-resistant, verifiable.
- ➖ Up to 24 h data-loss window at launch (accepted, and disclosed in the SLA).

## Verification
The `backup_last_success_timestamp` and `restore_test_last_success_timestamp` alerts. The drill log.
