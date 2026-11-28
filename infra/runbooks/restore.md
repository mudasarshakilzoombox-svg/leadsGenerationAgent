# Restore from backup

Launch targets (13-backup-recovery §1): **RPO 24 h, RTO 8 h**. The restore test must take under
60 minutes. Backups are nightly at 03:00 UTC: `pg_dump -Fc`, encrypted with age, stored in
Backblaze B2 (object lock, 35 days). Valkey is not backed up; the reconcilers rebuild queues
and caches from PostgreSQL (ADR-0005, ADR-0040).

## Monthly restore drill (operator machine)
Needs Docker, the B2 **read-only** key and the **offline** age private key. The private key never
goes to the server or to CI (SECURITY §5.3).
```bash
docker pull ghcr.io/<owner>/lga-backup:<latest release sha>   # or: docker build -f infra/docker/backup.Dockerfile -t lga-backup:dev .
export RCLONE_CONFIG_B2_ACCOUNT=<read-only key id> RCLONE_CONFIG_B2_KEY=<read-only key>
bash infra/backup/restore-drill.sh --source b2:<bucket> --key ~/secure/lga-backup.agekey --image <image>
```
The drill restores the newest backup into a throwaway PostgreSQL 18 container and checks:
- the migration version matches the manifest;
- the row counts of 10 key tables are within 1% of the manifest.

It then records the time and the result in `restore-log.md`. Commit that file.

## Real restore (data loss or corruption)
1. **Freeze writes:** `docker compose -p lga stop api worker` (the web app shows errors; nginx stays up).
2. **Pick the backup:** the newest one from before the incident. List them with
   `rclone lsf -R b2:<bucket>/pg/daily | sort | tail`.
3. **Restore into a fresh database**, which keeps the damaged one for forensics. On the server,
   streaming the backup in with the key on your laptop:
   ```bash
   # laptop: decrypt locally, stream the plain dump over SSH (never stored on disk)
   rclone cat b2:<bucket>/pg/daily/<path>.dump.age | age -d -i ~/secure/lga-backup.agekey \
     | ssh deploy@<vps> 'docker compose -p lga exec -T postgres sh -c \
         "createdb -U \$POSTGRES_USER lga_restored && pg_restore -U \$POSTGRES_USER --no-owner -d lga_restored"'
   ```
4. Check counts in `lga_restored`, then switch: rename `lga` to `lga_broken` and
   `lga_restored` to `lga` (`ALTER DATABASE ... RENAME TO ...`, with api and worker stopped).
5. `deploy.sh production <current sha>` runs migrations forward, then starts the stack.
6. **Re-apply erasures** done after the backup time: `compliance.reapply-erasures` (13 §5). This
   is mandatory before users are let back in, even though the job ships with the compliance
   module (Phase 3).
7. Write the incident and the measured RTO into `restore-log.md`.

## Backup alerts
- **BackupMissing** (no `backup.succeeded` in 26 h) or **BackupFailed**:
  1. `docker compose -p lga logs --tail 50 backup`. Look for the `msg` of `backup.failed`.
  2. Common causes:
     - an expired or revoked B2 key (create a new one: OPS_SETUP step 7);
     - a bucket quota;
     - a `BACKUP_AGE_RECIPIENT` typo;
     - postgres down.
  3. Run one backup now: `docker compose -p lga exec backup backup.sh`.
