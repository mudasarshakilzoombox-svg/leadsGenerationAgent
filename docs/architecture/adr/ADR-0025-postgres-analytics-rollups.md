# ADR-0025: Analytics from an event table and rollups in PostgreSQL

- **Status:** Proposed · **Date:** 2026-11-26

## Context
Customer dashboards need counts and rates by campaign, step, mailbox and date. Expected volume is ≤ 6M events per year at launch. A warehouse or product-analytics vendor adds cost and a sub-processor.

## Decision
An append-only `email_events` table with a unique `dedupe_key` (idempotent emission). Idempotent `analytics.rollup` upserts into `campaign_daily_stats` and `mailbox_daily_stats` (hourly for today, nightly for the last 3 days). Distinct-enrollment rates for arbitrary ranges are computed directly from events. Metric formulas live in one place (`packages/contracts/metrics.ts`). Product KPIs are derived from domain tables, with no third-party product analytics at launch.

## Alternatives considered
- **ClickHouse or BigQuery:** overkill and costly now.
- **PostHog or Mixpanel:** good product analytics, but a cost, a sub-processor and a cookie-consent burden. Revisit later (possibly self-hosted).
- **Materialized views:** a full refresh is costly. Incremental upserts are cheaper and controllable.

## Consequences
- ➕ Zero extra cost. Recomputable. Exact reconciliation possible.
- ➖ The event table grows. Partition at roughly 20M rows (04-database §13).

## Verification
Reconciliation tests (dashboard = raw counts). A nightly sampled consistency check.
