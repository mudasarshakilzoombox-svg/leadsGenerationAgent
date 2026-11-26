# ADR-0026: Hosted free-tier observability with low-cardinality metrics

- **Status:** Proposed · **Date:** 2026-11-26 · **Maps to:** AD-23

## Context
Self-hosting Loki, Prometheus, Grafana or Elasticsearch would consume gigabytes of RAM on an 8 GB VPS. The budget for tooling is under $50 a month (PRD §11).

## Decision
`pino` JSON logs with strict redaction, `prom-client` metrics and Sentry, all shipped by a single **Grafana Alloy** agent container (256 MB) to hosted free tiers (Grafana Cloud or Better Stack for logs and metrics, Sentry for errors, UptimeRobot or Better Stack for uptime). **No per-tenant labels** in metrics (keeps series under free-tier limits and avoids leaking identifiers). Per-tenant views come from the database. Correlation via `requestId` end to end.

## Alternatives considered
- **Self-hosted stack:** no vendor dependency, but too resource-heavy now.
- **Datadog or New Relic:** excellent, but costly.

## Consequences
- ➕ Near-zero cost, minimal footprint.
- ➖ Short log retention on free tiers (security history lives in `audit_logs`). Vendor limits must be watched.

## Verification
A cardinality budget check in CI (metric label allowlist). The redaction unit test.
