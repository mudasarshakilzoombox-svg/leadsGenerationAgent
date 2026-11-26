# 13. Backup and Recovery

> Status: Draft for review · Related: [ADR-0027](adr/ADR-0027-backups-pitr.md), ARCHITECTURE.md §17.6

## 1. Objectives

| Phase | RPO | RTO | Mechanism |
|-------|-----|-----|-----------|
| Launch (MVP) | ≤ 24 h | ≤ 8 h | Nightly logical backup (`pg_dump -Fc`), encrypted, offsite, immutable |
| V1 or > 100 paying workspaces | ≤ 15 min | ≤ 4 h | WAL-G continuous WAL archiving + weekly base backups (point-in-time recovery) + nightly logical dump kept |

## 2. What is protected

| Asset | Protection | Restore source |
|-------|-----------|----------------|
| PostgreSQL | §3 | Offsite bucket |
| Object storage (imports, exports, DSAR files) | Provider durability + bucket versioning (30 days) | Bucket versions. Short-lived files aren't critical |
| Valkey | AOF on volume. **Not backed up** | Rebuilt: reconcilers re-enqueue from DB state (ADR-0005) |
| Secrets (env files, encryption keys, `age` private key) | Password manager vault (2 owners) + sealed offline copy of the `age` private key and `APP_ENCRYPTION_KEYS` | Manual |
| Code, infra config, runbooks | Git (GitHub) | Clone |
| Container images | GHCR (immutable SHA tags) | Pull |
| Server configuration | `infra/scripts/bootstrap-server.sh` (idempotent), reproducible from git | Re-run |

## 3. PostgreSQL backups

### 3.1 Nightly logical backup (launch)

```text
03:00 UTC, backup container (cron):
  pg_dump -Fc -Z 6 --no-owner -d lga_production
    | age -r <backup-public-key>                       # encrypt in stream; no plaintext on disk
    | rclone rcat b2:lga-backups-prod/pg/daily/YYYY/MM/DD/lga-<ts>.dump.age
  write sidecar manifest (size, sha256 of ciphertext, pg version, migration version)
  push metric backup_last_success_timestamp; on failure → alert
```

- The **server holds only the public key** (`age` recipient), so a compromised server can't decrypt old backups.
- Backup bucket credentials on the server are **write-only (no delete, no overwrite)**. The bucket has **object lock / immutable retention** (for example, Backblaze B2 Object Lock in compliance mode for 35 days, or the equivalent retention lock on the chosen provider). A compromised server or ransomware can't delete or encrypt existing backups.
- Lifecycle: daily kept 35 days, weekly (Sunday copy) 12 weeks, monthly (1st) 6 months. Copies are made by the provider lifecycle or a separate privileged job run from an operator machine, not from the VPS.
- The staging database is **not** backed up (it's recreated from seeds).

### 3.2 Continuous archiving (V1)

- WAL-G in the `postgres` container: `archive_command = 'wal-g wal-push %p'`, `archive_timeout = 300` (a segment at least every 5 min, giving RPO ≤ 15 min with margin). Weekly `wal-g backup-push`. Encryption via WAL-G libsodium key, also held offline.
- Retention: 2 base backups + WAL in between (≈ 14 days PITR window), plus the nightly logical dumps for longer history.

## 4. Restore verification

| Test | Frequency | Procedure | Pass criteria |
|------|----------|-----------|---------------|
| Automated restore test | Monthly (launch), weekly (V1) | Operator-triggered workflow (later cron on a throwaway container): fetch latest dump → decrypt with the private key (held only in GitHub Actions secret for this job **or** operator machine) → `pg_restore` into a temporary `postgres:18` container → run `infra/scripts/verify-restore.sql` | Migration version matches. Row counts for 10 key tables within 1% of the manifest. `SELECT` on a sample of encrypted fields decrypts with the current key. Finished in < 60 min |
| Full DR drill | Quarterly | §6 scenario D on a fresh VPS (or a local VM), timed | Service restored and verified within the RTO |
| Tenant restore drill | Twice a year | §6 scenario F | Correct rows extracted for one workspace |

Results are logged in `infra/runbooks/restore-log.md` and exported as the metric `restore_test_last_success_timestamp`.

## 5. Erasure and backups

Backups are immutable, so erased personal data persists in backups until they age out (≤ 6 months). This is disclosed in the privacy policy (DATABASE_DESIGN.md §8.1). **After any restore**, re-apply erasures: the suppression list (hash-only `ERASURE_REQUEST` rows) and the `dsar_requests` log are used by `compliance.reapply-erasures` to re-delete data for every erasure completed after the backup timestamp. This step is mandatory in every restore runbook.

## 6. Disaster scenarios

| # | Scenario | Detection | Response | Target |
|---|----------|----------|----------|--------|
| A | Container crash or OOM | Docker healthcheck, memory alert | Auto-restart (`restart: unless-stopped`). Investigate the memory cause | Minutes |
| B | Bad deploy | Health check fails after deploy, error-rate alert | Automatic rollback to the previous image SHA (expand/contract migrations keep the old version compatible) | < 15 min |
| C | Bad migration or logical data corruption | Errors, user reports | Stop writes (maintenance mode: nginx 503 page + pause queues). Restore to a side DB (latest dump or V1 PITR to before the incident). Repair by targeted copy-back or full cutover. Re-apply erasures | ≤ RTO |
| D | VPS lost (hardware, account, compromise) | Uptime alerts | Provision a new KVM 2 → `bootstrap-server.sh` → restore env files from the vault → pull images → restore the latest backup → re-apply erasures → DNS cut-over (Cloudflare, TTL 300 s) → verify → resume queues. **If compromise is suspected: rotate all secrets first** (scenario G) | ≤ 8 h launch / ≤ 4 h V1 |
| E | Valkey data loss | Queue metrics drop, jobs missing | Restart Valkey. Reconcilers re-enqueue stale work within 5 min. Exactly-once guards prevent duplicate sends. Sessions re-cache from DB | < 30 min |
| F | Accidental deletion of one tenant's data (bug or operator error) | Report or audit | Restore the backup to a side DB. Export that workspace's rows (by `workspace_id`, dependency order). Import into production in one transaction through the operator CLI under system context reason `TENANT_RESTORE` (audited, two-person approval). Re-apply erasures for that workspace | 1 business day |
| G | Secret compromise (encryption key, DB password, provider key, webhook secret) | Alert, disclosure | Rotate per runbook: new `APP_ENCRYPTION_KEYS` version + `crypto.reencrypt` job, DB role passwords, provider keys, webhook secrets, session pepper (forces global logout). Notify affected customers per SECURITY.md §14 | Hours |
| H | Backup key loss | Restore test fails to decrypt | Use the second sealed copy. Generate a new keypair, start new backups immediately, keep old encrypted backups until they expire | Same day |
| I | Object-storage provider outage | Backup job errors | Backups retry, with a secondary destination (second bucket on another provider) as an option in V1. Uploads and imports degrade with an error state | Provider-dependent |

## 7. Restore runbook (scenario D, condensed)

```bash
# 1. New server
ssh root@new-vps 'bash -s' < infra/scripts/bootstrap-server.sh       # users, ufw, docker, swap, fail2ban
# 2. Config and secrets (from vault) into /opt/lga/env/ (mode 600)
# 3. Data
docker compose -f infra/compose/docker-compose.prod.yml up -d postgres valkey
rclone cat b2:lga-backups-prod/pg/daily/<latest>.dump.age | age -d -i backup.key \
  | docker compose exec -T postgres pg_restore -d lga_production --clean --if-exists --no-owner
docker compose run --rm migrate                                       # bring schema to current release
docker compose run --rm api node dist/cli.js compliance:reapply-erasures --since <backup-ts>
# 4. App
docker compose up -d api worker web nginx observability
# 5. Verify: /health/ready, login, dashboard, queue metrics, scheduler tick, test send to internal mailbox
# 6. DNS cut-over, then resume queues (kill switch off)
```

## 8. Responsibilities

- **Owner/operator:** custody of the vault and the sealed offline key copies (two people where possible), quarterly drills, and approving restores.
- **CI:** backup and restore-test workflows, metric emission, and alerts on staleness.
