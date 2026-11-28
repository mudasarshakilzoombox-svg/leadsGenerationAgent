# Incident quick reference

Server: `ssh deploy@<vps>`. Production project `lga`, staging project `lga-staging`.
Compose files are in `/opt/lga/compose/infra/docker`; set this alias once:
```bash
alias dc='docker compose -p lga -f /opt/lga/compose/infra/docker/compose.prod.yml -f /opt/lga/compose/infra/docker/compose.vps.yml --env-file /opt/lga/env/production.env'
```

## Site down (UptimeRobot alert)
1. Check state: `dc ps` (look for unhealthy or restarting) and `dc logs --tail 100 nginx api web`.
2. Check the host: `free -h`, `df -h /`, `uptime`.
3. Restart one service: `dc up -d --no-deps api` (or `web`, `worker`).
4. Started after a release? Roll back (`rollback.md`).

## Error spike
Sentry shows the stack trace and the release; Grafana Explore shows `{service="api", level="error"}`.
Fixable quickly: ship a fix. Otherwise roll back.

## Memory pressure
Stop staging first: `docker compose -p lga-staging down`. Then `docker stats --no-stream`.
The worker is the usual suspect. Lower `WORKER_CONCURRENCY_FACTOR` in `production.env` and
`dc up -d --no-deps worker`.

## Disk full
1. `docker system df`, then `docker image prune -a --filter until=168h`.
2. Logs are capped by the `local` driver (10 MB x 3 per container).
3. Still full: `du -xh / | sort -h | tail`.

## Agent down
HostMetricsMissing (no metrics in Grafana):
1. Check the agent: `dc ps observability docker-proxy`, then `dc logs --tail 50 observability`.
2. If the logs show 401s, the Grafana Cloud token expired (OPS_SETUP step 9).

## Contacts and access
Owner: see the password manager entry "LGA operations". Provider status pages:
- Hostinger
- Cloudflare
- Backblaze
- Sentry
- Grafana Cloud
