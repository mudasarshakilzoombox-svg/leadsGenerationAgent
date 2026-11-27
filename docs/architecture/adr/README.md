# Architecture Decision Records

Format: lightweight MADR (Context → Decision → Alternatives → Consequences → Verification). Every ADR starts as **Proposed**. On review each becomes **Accepted**, **Rejected** or **Amended**. A later change creates a new ADR that **supersedes** the old one. ADRs are never edited after acceptance (except status and links).

| ADR | Title | Status | Maps to |
|-----|-------|--------|---------|
| [0001](ADR-0001-modular-monolith.md) | Modular monolith with `api` and `worker` process roles | Proposed | AD-01 |
| [0002](ADR-0002-monorepo-pnpm-turborepo.md) | Monorepo with pnpm workspaces and Turborepo | Proposed | AD-02 |
| [0003](ADR-0003-nextjs-presentation-layer.md) | Next.js as a presentation layer, same-origin API, no BFF logic | Proposed | AD-03 |
| [0004](ADR-0004-rest-zod-contracts.md) | REST with shared Zod contracts and generated OpenAPI | Proposed | AD-04 |
| [0005](ADR-0005-postgres-source-of-truth.md) | PostgreSQL as source of truth, DB-first jobs with reconcilers | Proposed | AD-05 |
| [0006](ADR-0006-shared-schema-multitenancy.md) | Shared-schema multi-tenancy (workspace_id, composite FKs, RLS later) | Proposed | AD-06, AD-16 |
| [0007](ADR-0007-opaque-server-sessions.md) | Opaque server-side sessions instead of JWTs | Proposed | AD-07 |
| [0008](ADR-0008-customer-mailboxes-only.md) | Outreach only via customer mailboxes. SMTP/IMAP + Microsoft first | Proposed | AD-08, AD-20 |
| [0009](ADR-0009-provider-independent-ai-gateway.md) | Provider-independent AI gateway with task-tier routing | Accepted | AD-09 |
| [0010](ADR-0010-bounded-ai-workflows.md) | Bounded AI workflows with deterministic checks and action gates | Accepted | AD-10 |
| [0011](ADR-0011-byok-data-and-provenance.md) | BYOK prospect data with provenance recording | Proposed | AD-11 |
| [0012](ADR-0012-single-vps-docker-compose.md) | Single-VPS Docker Compose deployment with on-demand staging | Proposed | AD-12, AD-21 |
| [0013](ADR-0013-compliance-enforcement-points.md) | Compliance enforced at import, enrollment and send. Country policy | Proposed | AD-13, AD-22 |
| [0014](ADR-0014-polling-inbox-sync.md) | Polling-based inbox sync | Proposed | AD-14 |
| [0015](ADR-0015-tracking-off-links-domain.md) | Tracking off by default. Separate links domain | Proposed | AD-15 |
| [0016](ADR-0016-workspace-roles-rbac.md) | Three workspace roles with permission-based RBAC | Proposed | AD-17 |
| [0017](ADR-0017-campaign-launch-approval.md) | Campaign launch approval workflow | Proposed | AD-18 |
| [0018](ADR-0018-credit-ledger.md) | Credit ledger: grants, reservations, millicredits | Proposed | AD-19 |
| [0019](ADR-0019-hosted-checkout-payment-port.md) | Hosted checkout behind a `PaymentProvider` port | Proposed | AD-19 |
| [0020](ADR-0020-uuidv7-keys.md) | UUIDv7 primary keys | Proposed | — |
| [0021](ADR-0021-field-level-encryption.md) | Application-level field encryption with versioned keys | Accepted | — |
| [0022](ADR-0022-safefetch-egress-control.md) | SafeFetch as the only egress path for user-influenced URLs | Accepted | — |
| [0023](ADR-0023-exactly-once-sending.md) | Exactly-once sending via deterministic Message-ID and DB constraints | Proposed | — |
| [0024](ADR-0024-hmac-unsubscribe-tokens.md) | Stateless HMAC unsubscribe tokens with RFC 8058 | Accepted | — |
| [0025](ADR-0025-postgres-analytics-rollups.md) | Analytics from an event table and rollups in PostgreSQL | Proposed | — |
| [0026](ADR-0026-hosted-observability.md) | Hosted free-tier observability with low-cardinality metrics | Proposed | AD-23 |
| [0027](ADR-0027-backups-pitr.md) | Immutable encrypted backups. PITR in V1 | Proposed | — |
| [0028](ADR-0028-polling-first-realtime.md) | Polling first for realtime UI, SSE later | Proposed | — |
| [0029](ADR-0029-low-cost-supporting-services.md) | Low-cost supporting services | Proposed | AD-23 |
| [0030](ADR-0030-csv-only-uploads.md) | CSV-only uploads, streamed to private storage | Proposed | — |
| [0031](ADR-0031-prompt-registry-and-evals.md) | Prompts versioned in code with eval gates | Accepted | — |
| [0032](ADR-0032-repository-layout-apps-and-core.md) | Separate api and worker apps with a backend core package (amends 0001/0002 layout) | Accepted | — |
| [0033](ADR-0033-schema-v1-entities.md) | Schema v1 entities, code-synced catalog tables, tenant-safe delete policies | Accepted | — |
| [0034](ADR-0034-auth-implementation-and-read-only-role.md) | Authentication implementation choices and the READ_ONLY workspace role (amends 0016) | Accepted | — |
| [0035](ADR-0035-dashboard-ui-and-read-models.md) | Dashboard UI, read-only data endpoints and the admin shell | Accepted | — |
| [0036](ADR-0036-project-scoped-navigation.md) | Project-scoped navigation and dashboard (Explee-style) | Accepted | — |
| [0037](ADR-0037-ai-gateway-implementation.md) | AI gateway implementation choices (P0.2) | Accepted | — |
| [0038](ADR-0038-workspace-lifecycle-implementation.md) | Workspace lifecycle, purge path, reconcilers and the Bull Board guard (P0.4) | Accepted | — |
