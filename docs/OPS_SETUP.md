# Production setup checklist (owner)

Everything the code cannot do for you: accounts, DNS, keys and secrets. Do the steps in order and
tick them off. Values go into GitHub environments or `/opt/lga/env/*.env` on the server, **never**
into the repository. Background: ARCHITECTURE §17, ADR-0012, ADR-0040, `infra/runbooks/`.

## Monthly cost

All tools are free at launch (ROADMAP §4: under $50/month in tooling, plus the VPS).

| Item | Choice | Expected cost |
|---|---|---|
| Server | Hostinger KVM 2 (2 vCPU, 8 GB, 100 GB NVMe), production plus on-demand staging | the plan price |
| DNS | Cloudflare free | $0 |
| Errors | Sentry Developer (free, 5k errors/month) | $0 |
| Logs, metrics, alerts | Grafana Cloud free (50 GB logs, 10k series, 14-day retention) | $0 |
| Uptime | UptimeRobot free (50 monitors, 5-minute interval) | $0 |
| Backups | Backblaze B2: first 10 GB free, then about $6/TB/month | about $0 |
| Registry and CI | GitHub Actions and GHCR (a private repo has 500 MB of packages free) | $0–4 |
| Domains | app domain + links domain | about $2–4 |

## 1. Server
1. Buy a **Hostinger KVM 2** with **Ubuntu 24.04**, in a UK or EU datacenter.
2. In the Hostinger panel firewall, allow 22, 80 and 443 only.
3. Create an SSH key on your laptop if you don't have one: `ssh-keygen -t ed25519 -C lga-deploy`.
4. As root, run the bootstrap (it disables root login at the end):
   ```bash
   scp infra/scripts/bootstrap-server.sh root@<server-ip>:/root/
   ssh root@<server-ip> 'bash /root/bootstrap-server.sh --deploy-key "$(cat ~/.ssh/id_ed25519.pub)"'
   ```
   Optional: `--ssh-allow <your-ip>/32` restricts SSH to your IP. Preview first with `--dry-run`.
5. Check: `ssh deploy@<server-ip> 'docker version && sudo -n true'`. The `sudo` must **fail**.

## 2. Domains and DNS (Cloudflare)
1. Add both domains to Cloudflare (free plan) and switch the registrar's nameservers to Cloudflare.
2. Add these records:
   - `A app.<product-domain>` and `A links.<links-domain>`, both pointing at the server IP,
     **DNS only** (grey cloud) for the first certificate, TTL 300.
   - Optional later: turn the proxy on (orange cloud).

## 3. First TLS certificate
nginx needs a certificate before it can start with TLS. Issue it once, standalone:
```bash
ssh deploy@<server-ip>
docker run --rm -p 80:80 -v lga_letsencrypt:/etc/letsencrypt certbot/certbot:v5.9.0 certonly \
  --standalone --agree-tos -m <your-email> -d app.<product-domain> -d links.<links-domain> --cert-name app.<product-domain>
docker run --rm -v lga_letsencrypt:/etc/letsencrypt certbot/certbot:v5.9.0 certonly \
  --standalone --agree-tos -m <your-email> -d links.<links-domain>    # second name, own certificate
```
After this, the `certbot` service renews both every 12 h through nginx.

## 4. GitHub environments and secrets
Repository, then Settings, then Environments:
- **`staging`:** secrets `VPS_HOST`, `VPS_USER` (`deploy`), `VPS_SSH_KEY` and `VPS_KNOWN_HOSTS`.
  - `VPS_SSH_KEY`: a **separate** deploy key. `ssh-keygen -t ed25519 -f lga-ci`, then append
    `lga-ci.pub` to `~deploy/.ssh/authorized_keys`.
  - `VPS_KNOWN_HOSTS`: the output of `ssh-keyscan <server-ip>`.
- **`production`:** the same four secrets, **plus Required reviewers = you**. That is the manual
  approval before production.
- Also turn on branch protection on `main` (P0.6 / Gate 1): require the CI checks `verify`,
  `secrets` and `e2e` before merging.

## 5. Image pulls on the server (GHCR)
Create a GitHub fine-grained token with **read:packages** only, then:
```bash
ssh deploy@<server-ip> 'echo <token> | docker login ghcr.io -u <github-user> --password-stdin'
```

## 6. Server env files
Create `/opt/lga/env/production.env` and `/opt/lga/env/staging.env` (mode `600`, owner `deploy`).
Start from `.env.example`, generate fresh secrets (`openssl rand -base64 48`) and **never reuse
local values**. Production-specific lines:
```bash
APP_ENV=production
IMAGE_PREFIX=ghcr.io/<github-owner-lowercase>/lga
STACK_APP_ORIGIN=https://app.<product-domain>
LGA_APP_DOMAIN=app.<product-domain>
LGA_LINKS_DOMAIN=links.<links-domain>
COMPOSE_PROFILES=ops
INTEGRATIONS_MODE=real              # only once the real providers are configured
SENTRY_DSN=...                      # step 9
BACKUP_AGE_RECIPIENT=age1...        # step 8 (public key only)
BACKUP_REMOTE=b2:<bucket-name>
B2_KEY_ID=...  B2_APPLICATION_KEY=...           # step 7, the write-only key
GRAFANA_LOKI_URL=...  GRAFANA_LOKI_USER=...  GRAFANA_PROM_URL=...  GRAFANA_PROM_USER=...  GRAFANA_CLOUD_TOKEN=...
```
Staging: `APP_ENV=staging`, `INTEGRATIONS_MODE=fake`, `STACK_APP_ORIGIN=http://127.0.0.1:8081`,
its own passwords and key rings, and no backup, Grafana or Sentry lines.

## 7. Backblaze B2 bucket (backups)
1. Create a **private** bucket `lga-backups-prod` with **Object Lock enabled**. It can only be
   enabled at creation.
2. Default retention: **Compliance mode, 35 days** (ADR-0027).
3. Lifecycle rule: keep only the last version, and delete hidden files after 1 day. Object lock
   still protects everything for 35 days.
4. Application keys:
   - **Server key:** bucket `lga-backups-prod`, capabilities `writeFiles` + `listBuckets` only
     (no `deleteFiles`, no `readFiles`). Goes into `production.env` as `B2_KEY_ID` and
     `B2_APPLICATION_KEY`.
   - **Drill key:** `readFiles` + `listFiles`. Stays on your laptop, for the restore drill.
5. Longer retention (12 weekly, 6 monthly) runs from your laptop, never from the server
   (13 §3.1). Once a month, after the drill, copy the 1st-of-month backup to a second bucket
   `lga-backups-archive` (object lock 190 days) with an admin key:
   `rclone copy b2:lga-backups-prod/pg/daily/YYYY/MM/01 b2:lga-backups-archive/pg/monthly/YYYY/MM`.

## 8. Backup encryption key (age)
1. On your laptop:
   `docker run --rm --entrypoint age-keygen ghcr.io/<owner>/lga-backup:<sha> > lga-backup.agekey`,
   or install `age` and run `age-keygen -o lga-backup.agekey`.
2. Copy the `# public key: age1...` line into `BACKUP_AGE_RECIPIENT` in `production.env`.
3. Store `lga-backup.agekey` (the private key) in the password manager, plus one **offline**
   copy (USB stick or paper) together with `APP_ENCRYPTION_KEYS`. **Never** put it on the
   server or in GitHub. Without it, backups cannot be restored.

## 9. Monitoring accounts
- **Sentry:**
  - Create the organisation and project `lga` (platform: Node.js; one project for api,
    worker and web). Copy the DSN into `SENTRY_DSN`.
  - Under Settings, then Security & Privacy: turn on **Data Scrubber**, **Use Default
    Scrubbers** and **Prevent Storing of IP Addresses**. These sit on top of our own scrubbing.
- **Grafana Cloud:**
  - Create a free stack. Under Connections, take the **Loki** and **Prometheus** endpoints and
    users, then create an access policy token with `logs:write` and `metrics:write`. These
    fill the `GRAFANA_*` lines.
  - Import alert rules: Alerting, then Alert rules, then Import:
    - `infra/alloy/alerts.loki.yaml` with the Loki data source;
    - `infra/alloy/alerts.prom.yaml` with the Prometheus data source.
  - Contact point: your email and the Grafana IRM app (push).
- **UptimeRobot:** add these monitors and alert by email and app:
  - **Keyword** monitor on `https://app.<product-domain>/health/ready`, keyword `"status":"ok"`,
    every 5 minutes;
  - **SSL expiry** monitor on the app domain;
  - **SSL expiry** monitor on the links domain.

## 10. First release
1. `git tag v0.1.0 && git push origin v0.1.0`.
2. Actions, then **Release**: build, then staging, then approve production. See
   `infra/runbooks/release.md`.
3. Verify the release:
   - **Site:** `https://app.<product-domain>` loads.
   - **Sentry:** the next morning a `backup.succeeded` line is in Grafana Logs, and a test error
     appears without PII. Trigger one with
     `ssh deploy@<server-ip> 'docker compose -p lga exec api node dist/scripts/sentry-test.js'`;
     Sentry shows `[EMAIL]`.
   - **UptimeRobot:** green.
4. Run the first restore drill (`infra/runbooks/restore.md`), commit `restore-log.md`, and mark
   Gate 1 in `docs/reviews/GATE-1.md`.
