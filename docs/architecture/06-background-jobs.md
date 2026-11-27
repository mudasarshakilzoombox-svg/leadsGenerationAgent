# 06. Background Job Architecture

> Status: Draft for review · Related: [ADR-0005](adr/ADR-0005-postgres-source-of-truth.md), [ADR-0023](adr/ADR-0023-exactly-once-sending.md), ARCHITECTURE.md §10

## 1. Topology

- **BullMQ 5 on Valkey 8** (`maxmemory-policy noeviction`, AOF `everysec`, `requirepass` + ACL user `lga`).
- Key prefix `lga:{APP_ENV}` (production and staging stacks share nothing, because staging runs its own Valkey container).
- Producers live in api and worker. **Consumers live only in worker.**
- Connections: workers use `maxRetriesPerRequest: null` (BullMQ requirement). Producers use a separate connection with `enableOfflineQueue: false`, so the API fails fast if Valkey is down, and reconcilers re-enqueue later.

## 2. Queues

| Queue | Jobs | Concurrency | Default retry policy | Per-workspace cap |
|-------|------|-------------|----------------------|-------------------|
| `website` | `website.crawl`, `website.extract` | 2 | `standard` | 1 |
| `ai` | `icp.generate`, `draft.generate`, `reply.suggest`, `research.extract`, `ai.batch-poll` | 6 | `ai` | 2 |
| `discovery` | `discovery.run`, `import.process` | 2 | `provider` | 1 |
| `enrichment` | `enrich.contact`, `enrich.company`, `research.company` | 4 | `provider` | 2 |
| `verification` | `verify.email`, `verify.batch`, `verify.batch-poll` | 4 | `provider` | 2 |
| `scoring` | `score.lead`, `score.rescore-icp` | 4 | `standard` | 2 |
| `campaign-scheduler` | `campaign.schedule-tick`, `campaign.activate` | 1 | `none` (repeatable) | — |
| `email-send` | `email.send` | 4 | `send` | 2 |
| `inbox` | `inbox.sync-dispatch`, `inbox.sync`, `inbox.process-message`, `reply.classify` | 4 | `standard` | 2 |
| `meetings` | `meeting.suggest-slots`, `meeting.sync` | 2 | `provider` | 1 |
| `analytics` | `analytics.rollup` | 1 | `standard` | — |
| `billing` | `billing.period-rollover`, `billing.trial-expiry`, `billing.usage-alerts`, `billing.reconcile` | 1 | `standard` | — |
| `maintenance` | reconcilers, `mailbox.token-refresh`, `domain.dns-check`, retention purges, `workspace.purge`, `crypto.reencrypt` | 1 | `standard` | — |
| `webhooks` | `webhook.process` | 2 | `standard` | — |
| `notifications` | `notify.email`, `notify.in-app`, `notify.digest` | 2 | `standard` | — |

Total worker concurrency is about 40, which is fine for I/O-bound Node in 1.5 GB. While the staging stack runs, the production values are multiplied by 0.7 (`WORKER_CONCURRENCY_FACTOR`).

## 3. Job envelope

Every payload follows one Zod-validated envelope (`packages/contracts/jobs.ts`):

```ts
const JobEnvelope = z.object({
  v: z.literal(1),
  workspaceId: z.string().uuid().nullable(),   // null only for platform jobs (system context)
  requestId: z.string(),                       // correlation from the originating request/job
  actorUserId: z.string().uuid().nullable(),
  entity: z.object({ type: z.string(), id: z.string().uuid() }),
  idempotencyKey: z.string().max(200).optional(),
  enqueuedAt: z.string().datetime(),
  args: z.record(z.unknown()).default({}),     // small, non-sensitive parameters only
}).strict();
```

**Never in payloads:** emails, names, message bodies, tokens, API keys or provider responses (AGENTS.md rule 6). Processors load data from PostgreSQL.

## 4. Deterministic job IDs

| Job | `jobId` |
|-----|---------|
| `website.crawl` | `crawl_{analysisRunId}` |
| `discovery.run` | `disc_{discoveryRunId}` |
| `import.process` | `import_{importId}` |
| `verify.email` | `ver_{workspaceId}_{emailHashHex}_{yyyymmdd}` (dedupes the same email within a day) |
| `draft.generate` | `draft_{enrollmentId}_{stepId}_{draftVersion}` |
| `email.send` | `send_{enrollmentId}_{stepId}` |
| `inbox.sync` | `sync_{mailboxId}_{minuteBucket}` |
| `reply.classify` | `cls_{messageId}` |
| `webhook.process` | `wh_{webhookEventId}` |
| `billing.period-rollover` | `rollover_{subscriptionId}_{periodStart}` |

BullMQ ignores an `add` with an existing `jobId` while the job is retained, and DB constraints catch the rest.

> **BullMQ rule (verified in BullMQ 6 source):** custom job ids must not contain `:` and must not be integers, or `Queue.add` throws. Always build ids with `jobId(...parts)` from `@lga/core`, which joins with `_` and validates.

## 5. Processor template

```ts
@Processor('email-send', { concurrency: cfg.concurrency('email-send') })
export class EmailSendProcessor extends LgaProcessor<SendArgs> {
  async handle(env: JobEnvelope, job: Job): Promise<void> {
    // runInJobContext(env) already set RequestContext (workspaceId, requestId) in LgaProcessor.process()
    await this.fairness.acquire('email-send', env.workspaceId!);        // §8, delays the job if over cap
    try {
      const claimed = await this.sends.claim(env.entity.id, env.args.stepId); // CAS status → SENDING
      if (!claimed) return;                                               // already handled: idempotent no-op
      await this.sends.execute(claimed);                                  // SendPolicy → provider → persist
    } finally {
      await this.fairness.release('email-send', env.workspaceId!);
    }
  }
}
```

`LgaProcessor` (base class) adds: envelope parsing, `RequestContext`, structured logs (`jobId`, `queue`, `attempt`), metrics, error classification, and Sentry capture on final failure.

### Error classification

| Error class | Meaning | BullMQ action |
|-------------|---------|---------------|
| `RetryableError` (network, 5xx, timeout, lock timeout) | Transient | Throw, so BullMQ retries with the policy backoff |
| `RateLimitedError(retryAfterMs)` | Provider or fairness limit | `await job.moveToDelayed(now + retryAfterMs, token)` + `throw new DelayedError()` (does not consume an attempt) |
| `NonRetryableError` (validation, 401/403 from provider, credits insufficient, illegal state) | Permanent | `job.discard()` + throw. The entity is set to `FAILED` with an error code |
| Unknown | Bug | Retry per policy. Sentry on final attempt |

### Retry policies

| Policy | Attempts | Backoff |
|--------|---------|---------|
| `standard` | 5 | exponential, base 30 s, jitter |
| `provider` | 6 | exponential, base 60 s, jitter (respects `Retry-After`) |
| `ai` | 4 | exponential, base 20 s + provider fallback inside the call |
| `send` | 3 | fixed 5 min (transient SMTP 4xx). Permanent 5xx is non-retryable |
| `none` | 1 | Repeatable ticks. The next tick covers the work |

Retention: `removeOnComplete: { age: 86400, count: 1000 }`, `removeOnFail: { age: 14 * 86400 }`.

## 6. Pipelines: stage chaining (no Redis-held flows)

Multi-stage work (discovery → enrichment → verification → scoring) is **chained through the DB**, not through BullMQ Flows, so the state survives Valkey loss (ADR-0005):

1. A stage processor finishes an entity, updates its DB status (for example `contacts.email_status = UNVERIFIED`), and enqueues the next stage job after commit.
2. Run-level progress (`discovery_runs.results_*`) is computed by counting entity statuses, not by in-memory counters.
3. Reconcilers (§9) re-enqueue any entity stuck between stages.

## 7. Scheduler: `campaign.schedule-tick` (every 60 s)

Single-flight: a Valkey lock `lock:schedule-tick` (`SET NX PX 55000`), plus `SKIP LOCKED` in the DB, so even two ticks cannot double-schedule.

```text
now = clock.now()
claim = SELECT e.* FROM campaign_enrollments e JOIN campaigns c ON c.id = e.campaign_id
        WHERE e.status = 'ACTIVE' AND e.next_action_at <= now + 60s AND e.scheduled_send_at IS NULL
          AND c.status = 'ACTIVE'
        ORDER BY e.next_action_at LIMIT 500 FOR UPDATE OF e SKIP LOCKED

group claim by workspace; take at most WORKSPACE_TICK_CAP (default 100) per workspace   -- fairness
for each enrollment e (ordered by next_action_at):
  step = nextStep(e)
  if workspace blocked (standing SUSPENDED/RESTRICTED-cap, status READ_ONLY/PAST_DUE grace over): pause campaign; continue
  if Entitlements.emailsRemaining(ws) <= 0: pause campaign EMAIL_LIMIT_REACHED; continue
  local = toRecipientTime(now, e.contact.timezone ?? countryDefaultTz ?? campaign.timezone)
  if !inWindow(local, campaign.send_window):
      e.next_action_at = nextWindowOpen(local) + jitter(0..20 min); continue
  draft = approvedDraft(e, step)
  if !draft:
      ensureDraftGenerationEnqueued(e, step); e.next_action_at = now + 15 min; continue
  mb = e.mailbox (sticky) ; if mb.status != CONNECTED: try reassign within campaign mailboxes else continue
  cap = effectiveDailyLimit(mb, today)                   -- ramp-up: min(limit, start + inc * daysSinceStart)
  used = countSentOrScheduledToday(mb)                   -- email_messages today + enrollments with scheduled_send_at today
  if used >= cap: e.next_action_at = startOfNextDay(mb.tz) + jitter; continue
  slot = max(now, mb.next_free_slot_at) + randomBetween(min_interval, 2.5 * min_interval)
  if slot beyond today's window end: e.next_action_at = nextWindowOpen(...); continue
  mb.next_free_slot_at = slot
  e.scheduled_send_at = slot
  afterCommit: JobProducer.add('email-send','email.send', env(e, step), { jobId: jobId('send', e.id, step.id), delay: slot - now })
commit
```

The new columns `campaign_enrollments.scheduled_send_at` and `mailboxes.next_free_slot_at` are listed in DATABASE_DESIGN.md §5.4. After the send completes (or is skipped), `scheduled_send_at` is cleared and `next_action_at` is set from the next step's delay (business days honoured).

## 8. Per-workspace fairness (noisy-neighbor control)

BullMQ OSS has no per-group concurrency, so fairness uses two mechanisms:
- **Scheduler level:** `WORKSPACE_TICK_CAP` per tick.
- **Processor level:** `Fairness.acquire(queue, workspaceId)` is a Valkey counting semaphore (`sem:{queue}:{workspaceId}`, Lua `INCR` with cap + TTL 10 min as a lease). Over the cap, it throws `RateLimitedError(5–15 s jitter)`, so the job is delayed without using an attempt. Caps are in §2.

## 9. Reconcilers (`maintenance`, every 5 min, system context)

| Reconciler | Finds | Action |
|-----------|-------|--------|
| Stale runs | `analysis_runs`, `discovery_runs`, `imports` in `QUEUED`/`RUNNING` past their timeout | Re-enqueue (same jobId) or mark `FAILED` after 3 reconciles |
| Pipeline gaps | Contacts `UNVERIFIED` older than 30 min with auto-verify on and credits available | Enqueue `verify.email` |
| Stuck sends | `email_messages.status = SENDING` older than 10 min | `MailboxProvider.findSentByMessageId()`: found → `SENT`. Not found on a provider with reliable Sent copies → `FAILED` and clear `scheduled_send_at` (rescheduled next window). Not found on an SMTP host without Sent copies → `SENT` + `delivery_unconfirmed=true` (**never resend when uncertain**, ADR-0023) |
| Orphan scheduled sends | `scheduled_send_at < now − 15 min` with no `email_messages` row and no BullMQ job | Clear `scheduled_send_at` |
| Draft generation | Enrollments due within 24 h with no draft and no job | Enqueue `draft.generate` |
| Credit reservations | `usage_records.status = RESERVED` older than 1 h | Release |
| Webhooks | `webhook_events.status = RECEIVED` older than 5 min | Re-enqueue |
| Inbox sync | Mailboxes `CONNECTED` with `last_synced_at` older than 15 min | Enqueue sync + raise `inbox_sync_lag` alert if repeated |

**As implemented (P0.4, ADR-0038):**
- **Framework.** A reconciler implements `Reconciler { key, description, run(): {examined, acted} }` (`packages/core/src/platform/jobs/reconciler.ts`) and is listed in `MaintenanceModule`.
- **Sweep.** The worker registers `reconcile.sweep` on the `maintenance` queue with `upsertJobScheduler('maintenance-reconcile', every 5 min)`. `ReconcilerRunner` runs each reconciler under its own Valkey lock (`lock:reconcile:<key>`), so an overlapping sweep skips it, and one failure never stops the others.
- **Live reconcilers:**
  - `workspace-purge-due`: enqueues `workspace.purge` with `jobId('workspace-purge', id)`.
  - `ai-run-payload-purge`: clears `ai_runs` payloads older than 30 days.

## 10. Repeatable schedules

| Job | Cadence | Notes |
|-----|---------|-------|
| `campaign.schedule-tick` | every 60 s | §7 |
| `inbox.sync-dispatch` | every 60 s | Selects mailboxes with `last_synced_at < now − 3 min` (≤ 50 per dispatch, oldest first) and enqueues `inbox.sync` |
| Reconcilers | every 5 min | §9 |
| `mailbox.token-refresh` | every 10 min | OAuth tokens expiring within 15 min |
| `domain.dns-check` | daily 04:00 UTC + on demand | |
| `ai.batch-poll`, `verify.batch-poll` | every 5 min while batches are open | |
| `analytics.rollup` | hourly (today) + nightly 01:00 UTC (last 3 days) | |
| `billing.trial-expiry`, `billing.usage-alerts` | hourly | |
| `billing.reconcile` | nightly 05:00 UTC | Compare provider subscriptions with the DB |
| Retention purges | nightly 02:00 UTC | [04-database.md](04-database.md) §10 |
| `notify.digest` | daily 07:00 in each user's timezone (hourly job selects due users) | |

Schedulers are registered with `upsertJobScheduler` at worker startup (idempotent) and are owned by code, never created ad hoc.

## 11. Observability

Metrics per queue: depth by state, wait time (enqueue → start), processing duration, outcome counts, retries, delayed due to fairness, and oldest waiting job age. Alerts: oldest waiting > 10 min (`email-send`, `inbox`), failed jobs > 20 per 15 min per queue, scheduler tick missed > 3 times. See [12-observability.md](12-observability.md).

## 12. Operations

- **Bull Board** at `/admin/queues` (Super Admin + IP allowlist): inspect, retry and remove jobs. Retrying from Bull Board is safe because processors are idempotent.
  - *As implemented (P0.4, ADR-0038):* the API mounts it behind a placeholder guard: `SUPER_ADMIN` plus a client IP in `ADMIN_IP_ALLOWLIST` (empty means nobody). It always denies in staging and production until MFA exists (P6.1), and returns 404 otherwise. nginx still returns 404 for the path.
- **Admin replay:** "Re-run failed items for entity X" in the Super Admin console enqueues fresh jobs with the same deterministic IDs.
- **Pause switches:** `queue.pause()` exposed via kill switches (pausing `email-send` globally is the "stop all sending" switch, ADR-0013).

## 13. Testing

- Processors are tested against real Valkey and PostgreSQL (Testcontainers) with a fake `Clock` and fake providers.
- Scheduler property tests: no double scheduling under concurrent ticks, caps never exceeded, windows respected across DST changes, fairness between two workspaces.
- Chaos test (Gate 3): kill the worker mid-send and flush Valkey, then verify zero duplicates and eventual delivery.
