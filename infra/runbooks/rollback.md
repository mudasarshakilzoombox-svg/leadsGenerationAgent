# Rollback

Target: production on the previous image in under 15 minutes (13-backup-recovery §6 B).

## Automatic
`infra/scripts/deploy.sh production <sha>` redeploys the previous release by itself when the new
one fails the health gate or the smoke checks. The Release job then fails and says so. Nothing
to do except find out why (Sentry, Grafana, `docker compose logs`).

## Manual: a bad release passed the checks
1. Find the last good SHA: `/opt/lga/state/production.previous` on the server, or the
   previous successful Release run.
2. GitHub, then Actions, then **Release**, then **Run workflow**, then `rollback_to = <sha>`.
   It needs production approval.
3. Without GitHub, on the server as `deploy`:
   ```bash
   LGA_COMPOSE_DIR=/opt/lga/compose/infra/docker bash /opt/lga/compose/infra/scripts/deploy.sh production <sha>
   ```

## Database
Migrations are expand-only, so older code runs against the newer schema; never roll back
migrations. If a migration itself corrupted data, restore the database instead (`restore.md`).

## If the rollback also fails
The script prints `ROLLBACK FAILED`. Then:
- `docker compose -p lga ps` and `docker compose -p lga logs --tail 200 api worker web migrate`
- **Out of memory?** Stop staging first: `docker compose -p lga-staging down`.
- **Disk full?** `docker system df`, then `docker image prune -a --filter until=168h`.
- Still down: post a status note, then follow `incident-quickref.md`.
