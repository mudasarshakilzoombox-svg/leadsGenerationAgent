# ADR-0029: Low-cost supporting services

- **Status:** Proposed · **Date:** 2026-11-26 · **Maps to:** AD-23, PRD §2 D11

## Context
The startup target is under $50 a month in tooling plus the VPS at launch. Each service must be swappable.

## Decision

| Need | Choice | Swap path |
|------|--------|-----------|
| DNS, edge proxy, bot challenge | Cloudflare free (DNS, optional proxy, Turnstile) | Registrar DNS, hCaptcha |
| System email | Amazon SES (lowest cost) or Resend (free tier, simplest) | Postmark (behind the notifications adapter) |
| Object storage and backups | Backblaze B2 (object lock) or Cloudflare R2 | Any S3-compatible |
| Errors | Sentry free/developer | GlitchTip self-hosted |
| Logs, metrics, alerts | Grafana Cloud or Better Stack free tiers + Grafana Alloy | Self-hosted on a bigger box |
| Uptime | UptimeRobot / Better Stack free | — |
| Email verification | Lowest-cost reliable verifier after an accuracy eval | Other verifier adapters |
| CI and registry | GitHub Actions + GHCR | — |

## Alternatives considered
Premium equivalents (Datadog, Postmark-only, Auth0, managed Postgres) were rejected for now on cost. Each can replace its counterpart behind the existing adapters.

## Consequences
- ➕ Minimal fixed costs. Variable costs are covered by customer credits.
- ➖ Free-tier limits and retention must be monitored. Some vendors' data-processing terms must be reviewed as sub-processors.

## Verification
A monthly cost review against PRD §8.6 and ROADMAP §4. The sub-processor list is kept current.
