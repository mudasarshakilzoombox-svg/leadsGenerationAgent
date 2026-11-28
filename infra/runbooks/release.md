# Release

Ships one commit to production through staging (ARCHITECTURE §17.5, ADR-0040). Expected time:
about 20 minutes, most of it image builds.

## Before
- `main` is green in CI: verify, secrets and e2e.
- New migrations are **expand-only** (AGENTS.md). Never ship a column drop together with the code
  that stops using the column; drops go in a later release.
- Release window: staging and production share the VPS. Avoid peak hours.

## Ship
1. Tag the commit and push the tag:
   ```bash
   git tag v0.1.0 <sha> && git push origin v0.1.0
   ```
2. GitHub Actions, **Release** workflow:
   - **build:** five images, a Trivy scan (fails on CRITICAL with a fix), then a push to GHCR as
     `:<sha>` and `:v0.1.0`.
   - **staging:** `deploy.sh staging <sha>` on the VPS runs migrations plus the dev seed, starts,
     waits for all containers to be healthy, runs the smoke checks, then stops staging.
   - **production:** waits for your approval (environment `production`). Approve once staging is
     green.
3. Production deploy (`deploy.sh production <sha>`):
   - pull, migrate, restart api/worker/web, start nginx;
   - health gate: api, worker and web healthy within 3 minutes;
   - smoke: `/health/ready` ok, `/login` 200, cross-origin POST rejected.
   - If the health gate or smoke fails, it **rolls back to the previous release automatically**
     and the job fails. See `rollback.md`.

## After
- Open `https://app.<domain>` and sign in.
- Sentry: no new error spike for the release. Grafana: no `ErrorLogSpike`.
- `/opt/lga/state/production.release` holds the live SHA; `production.previous` holds the
  rollback target.

## Rehearse locally (no server)
```bash
pnpm stack:build                                            # images lga-*:dev
for s in web api worker migrate; do docker tag lga-$s:dev lga-$s:r1; docker tag lga-$s:dev lga-$s:r2; done
bash infra/scripts/deploy.sh staging r1 --local             # migrate + seed, health, smoke, stop
bash infra/scripts/deploy.sh production r1 --local          # live on :8080
bash infra/scripts/deploy.sh production r2 --local --force-unhealthy   # fails, rolls back to r1
```
