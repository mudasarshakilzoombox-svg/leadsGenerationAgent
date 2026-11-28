# ADR-0040: Production operations: bootstrap, staging, release pipeline, observability, backups (P0.6)

- **Status:** Accepted · **Date:** 2026-11-28 · **Implements:** ADR-0012, ADR-0026, ADR-0027, ADR-0029, 12-observability, 13-backup-recovery, ARCHITECTURE §17 · **Amends:** ARCHITECTURE §17.2 (image layout), §17.6 (retention), §17.4 (staging exposure)

## Context
Phase 0 must end with deploys and recovery that are routine: a scripted server, a staging run
before production, automatic rollback, error tracking without personal data, shipped logs, an
uptime check and encrypted, immutable backups with a timed restore drill (Gate 1).

Several choices were still open in the docs ("B2 or R2", "Grafana Cloud or Better Stack",
"UptimeRobot or Better Stack"). Some docs disagree with each other:
- retention: 7/4/6 in ARCHITECTURE §17.6 vs 35/12/6 in ADR-0027;
- where the restore key lives;
- Valkey backups: the prompt pack asks for them, 13 §2 says no;
- the deploy trigger;
- the image layout.

No server or vendor account exists yet.

## Decision
1. **Vendors** (owner, 2026-11-28; all free tiers at launch, within ROADMAP §4):
   - **Backblaze B2** for backups: object lock in compliance mode, 35 days.
   - **Grafana Cloud** for logs, host metrics and alerts, fed by one **Grafana Alloy** container
     (256 MB) through a read-only `docker-socket-proxy`.
   - **UptimeRobot** for uptime and TLS expiry.
   - **Sentry** for errors in api, worker and web.
2. **Error tracking:**
   - `@sentry/node` and `@sentry/nextjs` 11.12.0 (MIT). They are off unless `SENTRY_DSN` is set.
   - Sentry v11 replaced `sendDefaultPii` with `dataCollection`. We set it to collect no users,
     cookies, bodies, query strings, local variables or payloads, and only an allow-list of
     headers.
   - Every event also passes `scrubEvent` (`@lga/shared`): the same deny-list as the log
     redaction, plus email- and token-like substrings, with Sentry ids preserved.
   - Only 5xx and unexpected errors are reported (never expected 4xx `DomainError`s), plus a
     job's final failure.
   - The web DSN is read at runtime (a `<meta>` tag rendered by the root layout), so the image is
     the same for every environment. The browser SDK is lazy-loaded only when a DSN exists, and
     the CSP `connect-src` gains only the DSN's origin.
   - No session replay.
   - Web source-map upload is a follow-up (backend traces are readable through
     `--enable-source-maps`).
3. **Backups:**
   - A `backup` service (profile `ops`; postgres:18-alpine plus age, rclone and supercronic,
     non-root) runs `pg_dump -Fc | age -r <public key> | rclone rcat b2:…` nightly at 03:00 UTC
     and uploads a manifest: sha256, size, pg version, migration and 10 row counts.
   - The server has only the age **public** key and a B2 key that cannot delete or overwrite.
     The private key stays offline (SECURITY §5.3 wins over 13 §4's "or GitHub secret").
   - Retention follows **ADR-0027**: 35 days of daily backups are kept by object lock. The weekly
     and monthly copies (12 weeks / 6 months) are made by the operator into an archive bucket,
     never by the VPS (13 §3.1).
   - **Valkey is not backed up**, as 13 §2 and ADR-0027 say (owner confirmed). The prompt pack's
     "Valkey snapshot" is dropped, because restoring old queue state would replay stale jobs.
   - The staging DB is seeded, not backed up.
   - `infra/backup/restore-drill.sh` restores the newest backup into a throwaway container,
     verifies it against the manifest and logs the time against the RTO in
     `infra/runbooks/restore-log.md`.
4. **Stacks:**
   - **Images:** the repo's four app images (web, api, worker, migrate) plus `backup` are
     published to GHCR as `${IMAGE_PREFIX}-<svc>:<sha>`. This replaces ARCHITECTURE §17.2's
     single "lga-backend" image.
   - **Production:** `compose.prod.yml` plus `compose.vps.yml` (TLS on 80/443, nginx rendered
     from a template with only `LGA_*` substituted, a certbot renewal loop, and nginx reloading
     every 6 h).
   - **Staging:** `compose.staging.yml` (project `lga-staging`, separate volumes, memory limits
     ≤ 1.5 GB). It is **server-only**: it listens on `127.0.0.1:8081`, is reached over SSH and has
     no public DNS or certificate (owner choice). It is started for a release and stopped
     afterwards.
   - **Secrets:** compose reads the env file `/opt/lga/env/<env>.env` (mode 600) by
     interpolation, not `env_file`. The effect is the same (SECURITY §5.1).
5. **Release pipeline:**
   - **Trigger:** a `v*` tag (the prompt's done-criterion). Merges to `main` only run CI.
   - `.github/workflows/release.yml`:
     1. builds the images, scans them with Trivy (CRITICAL with a fix fails) and pushes to GHCR;
     2. deploys staging (migrate plus seed, health gate, smoke, stop);
     3. after a required reviewer approves, deploys production.
   - `infra/scripts/deploy.sh` does: pull, `run --rm migrate`, `up -d --no-deps api worker web`,
     nginx, then the health gate (all three healthy) and a curl smoke. It **rolls back
     automatically** to the previous release recorded in `/opt/lga/state`.
   - A `workflow_dispatch` input redeploys any earlier SHA. The input reaches the shell only
     through an environment variable (no injection).
   - Secrets live only in the GitHub environments `staging` and `production`.
6. **Server bootstrap:** `infra/scripts/bootstrap-server.sh` is idempotent and supports
   `--dry-run`. It sets up:
   - a `deploy` user with no sudo, key-only SSH and no root login;
   - ufw (22, 80, 443), fail2ban, unattended upgrades with a 04:30 reboot window, chrony;
   - 4 GB swap;
   - Docker from its apt repository, with the `local` log driver.
7. **Owner work** that the code cannot do (accounts, DNS, keys, first certificate) is a numbered
   checklist in `docs/OPS_SETUP.md`.

## Consequences
- A release is one tag push plus one approval, and a bad release rolls itself back.
- Error reports, logs and metrics carry ids and fixed label sets only. Scrubbing is proven by a
  test that sends a real Sentry event to a local sink.
- Backups survive a compromised server (no delete rights, object lock, key offline). Losing the
  offline key means losing the backups, so the checklist requires two copies.
- Until the owner completes `docs/OPS_SETUP.md`, the pipeline is proven only by the local
  rehearsal (staging deploy, production deploy, forced rollback) and the local restore drill.
  Gate 1's "deploys by CI" item stays pending until the first real tag.
