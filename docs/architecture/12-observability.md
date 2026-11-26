# 12. Logging and Monitoring

> Status: Draft for review · Related: [ADR-0026](adr/ADR-0026-hosted-observability.md), ARCHITECTURE.md §14

## 1. Stack (low cost)

| Signal | Tool | Cost |
|--------|------|------|
| Logs | `pino` JSON → Docker `local` driver → **Grafana Alloy** agent → Better Stack or Grafana Cloud Logs | Free tier at launch |
| Metrics | `prom-client` `/metrics` (api :4000 internal path, worker :4100) + Alloy built-in node exporter + postgres_exporter + redis_exporter (works for Valkey) → Grafana Cloud Metrics | Free tier (keep < 10k active series) |
| Errors and performance | Sentry (web, api, worker), 10% trace sampling | Free/developer tier |
| Uptime and TLS | UptimeRobot or Better Stack uptime on `/health/ready`, the links domain and TLS expiry | Free |
| Alert delivery | Grafana alerting → email + mobile push (Grafana OnCall/IRM free tier or Better Stack app) | Free |

All agents run in one `observability` container (Alloy) with a 256 MB memory limit.

## 2. Logging

### 2.1 Format

```json
{ "ts":"2026-11-26T09:15:00.123Z", "level":"info", "service":"worker", "env":"production", "release":"a1b2c3d",
  "requestId":"f3a1…", "workspaceId":"0193…", "userId":"0193…", "queue":"email-send", "jobId":"send:…", "attempt":1,
  "module":"email-engine", "event":"email.sent", "durationMs":812, "msg":"Email sent" }
```

- `event` is a stable dotted name (searchable). `msg` is human text.
- IDs only. **Never** emails, names, subjects, bodies, prompts, model outputs, tokens, cookies, API keys, IPs of prospects or raw provider payloads.

### 2.2 Redaction (pino `redact`, plus a deny-list serializer)

```
req.headers.cookie, req.headers.authorization, req.headers["x-api-key"],
*.password, *.currentPassword, *.newPassword, *.token, *.accessToken, *.refreshToken, *.apiKey, *.secret,
*.email, *.emailAddress, *.to, *.from, *.subject, *.body, *.bodyText, *.bodyHtml, *.content, *.prompt, *.completion,
*.credentials, *.firstName, *.lastName, *.fullName, *.phone
```

A unit test logs a fixture containing all of these and asserts none appear in the output. Error objects are serialized with `message`, `code` and `stack`. Messages from provider SDKs are passed through a scrubber that removes email-like and token-like substrings.

### 2.3 Levels and volume

`error`: needs attention. `warn`: degraded but handled (fallback, retry exhaustion). `info`: business events (one per request/job outcome). `debug`: off in production. HTTP access logs come from nginx (sampled 10% for 2xx, 100% for 4xx/5xx), with no query strings logged on `/u/` and `/auth/` routes. Retention is per vendor free tier (≈ 3–14 days), which is enough for debugging. Security-relevant history lives in `audit_logs` (24 months), not in logs.

### 2.4 Correlation

nginx sets `X-Request-Id` (`$request_id`) if absent → api `RequestContext.requestId` → job envelopes → logs, Sentry tags, `ai_runs` and `audit_logs.request_id`. It's returned to clients in problem+json `requestId` so support can trace from a user report.

## 3. Metrics (low cardinality)

**Rule:** no `workspaceId`, `userId`, email or URL labels. Per-tenant views come from the database, not Prometheus.

| Metric | Labels |
|--------|--------|
| `http_request_duration_seconds` (histogram) | `method`, `route` (template), `status_class` |
| `bullmq_queue_jobs` (gauge) | `queue`, `state` |
| `bullmq_oldest_waiting_seconds` (gauge) | `queue` |
| `job_duration_seconds` (histogram) | `queue`, `job`, `outcome` |
| `job_fairness_delays_total` | `queue` |
| `provider_requests_total` | `provider`, `outcome` (`ok`/`retryable`/`permanent`/`rate_limited`) |
| `provider_circuit_open` (gauge) | `provider` |
| `emails_sent_total` | `provider_kind` |
| `email_send_blocked_total` | `reason` (SP-xx codes) |
| `bounces_total` | `type` |
| `inbox_sync_lag_seconds` (gauge, max over mailboxes) | `provider_kind` |
| `scheduler_tick_duration_seconds`, `scheduler_enrollments_scheduled_total` | — |
| `ai_requests_total` | `task`, `provider`, `status` |
| `ai_tokens_total` | `provider`, `model`, `kind` (`in`/`cached`/`out`) |
| `ai_cost_micros_total` | `task` |
| `ai_check_failures_total` | `check_id`, `severity` (`warn`/`block`) |
| `credits_settled_millicredits_total` | `action` |
| `credit_shortfall_millicredits_total` | — |
| `auth_login_failures_total`, `auth_lockouts_total` | `reason` |
| `webhook_signature_failures_total` | `provider` |
| `tenant_context_violations_total` | `kind` (must stay 0) |
| `backup_last_success_timestamp`, `restore_test_last_success_timestamp` | `kind` |
| Node, container and host: CPU, memory, disk, network. Postgres: connections, locks, deadlocks, cache hit. Valkey: memory, ops | — |

## 4. Error tracking (Sentry)

- `release` = git SHA. `environment` = `APP_ENV`. Source maps are uploaded in CI and **not** served publicly.
- `beforeSend` scrubs with the same deny-list as §2.2. Request bodies and cookies are never attached. `sendDefaultPii: false`.
- Grouping by `code` for `DomainError` (expected 4xx errors are not sent to Sentry, only 5xx and unexpected errors).
- Frontend: errors and web vitals (LCP, INP), with 10% session traces and **no session replay** (privacy).

## 5. Health checks

| Endpoint | Checks | Used by |
|----------|--------|---------|
| `GET /health/live` (api, worker :4100) | Process event loop responsive | Docker healthcheck (restart policy) |
| `GET /health/ready` (api) | `SELECT 1` (≤ 500 ms), Valkey `PING`, migrations at expected version | Deploy script, uptime monitor |
| `GET :4100/health/ready` (worker) | DB, Valkey, all queue workers running, last scheduler tick < 3 min ago | Deploy script, alert |

## 6. Alerts

| Alert | Condition | Severity |
|-------|----------|----------|
| API down | Uptime check fails 2 × 1 min | Critical |
| Error rate | 5xx > 2% of requests over 10 min | High |
| Latency | p95 > 1 s over 15 min (excluding uploads) | Medium |
| Send backlog | `bullmq_oldest_waiting_seconds{queue="email-send"}` > 600 | High |
| Scheduler stalled | No tick in 3 min | Critical |
| Inbox sync lag | > 15 min | High |
| Failed jobs spike | > 20 failed per queue in 15 min | Medium |
| Provider circuit open | any, for > 5 min | Medium |
| Bounce spike (platform) | Hard bounces > 3% of sends over 1 h | High |
| Tenant context violation | `tenant_context_violations_total` increases | **Critical (security)** |
| Webhook signature failures | > 10 in 10 min | Medium (security) |
| Login failures | > 200 in 10 min | Medium (security) |
| Super Admin activity | Impersonation started, kill switch used | Info (notify) |
| AI cost | Daily AI cost > 150% of 7-day average, or a workspace hits its internal cap | Medium |
| Credit shortfall | > 0 in 24 h | Low |
| Disk | > 80% | High |
| Memory | Container > 90% of limit for 5 min, or host swap usage > 1 GB | High |
| Postgres | Connections > 80%, deadlocks > 0, long transaction > 60 s | Medium |
| Backups | No successful backup in 26 h. No restore test in 35 days | Critical / High |
| TLS | Certificate expires in < 14 days | High |

Each alert links to a runbook in `infra/runbooks/` (ARCHITECTURE.md §14, SECURITY.md §14).

## 7. SLOs

| SLO | Target | Measure |
|-----|--------|---------|
| App availability | 99.5% monthly | Uptime checks on `/health/ready` and the login page |
| Send punctuality | 99% of sends within ±2 min of the scheduled slot | `email.send` start − `scheduled_send_at` |
| Reply visibility | 99% of replies visible ≤ 5 min after arrival | `received_at` (provider) → stored |
| Website analysis | 95% complete < 3 min | `analysis_runs` durations |

## 8. Dashboards (Grafana)

1. **Overview:** traffic, errors, latency, queue health, sends, bounces, AI cost today.
2. **Email:** sends by provider kind, blocks by reason, bounces, sync lag, mailbox pauses.
3. **AI:** requests, latency, fallback rate, invalid outputs, check failures by id, cost by task.
4. **Infra:** host CPU, memory, disk, container memory, Postgres, Valkey.
5. **Security:** login failures, lockouts, webhook signature failures, admin actions, rate-limit hits, tenant context violations.
