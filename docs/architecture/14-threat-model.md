# 14. Threat Model

> Status: Draft for review · Owner: Security · Review: at every phase gate and whenever a new integration, agent or public endpoint is added
> Policies: [SECURITY.md](../SECURITY.md) · Controls detail: docs 02–13, [15-ai-security-controls.md](15-ai-security-controls.md)

## 1. Scope and method

- **Scope:** web app, API, worker, PostgreSQL, Valkey, object storage, nginx/VPS, CI/CD, and integrations (LLMs, verifier, BYOK data providers, mailboxes, payments, system mail, observability).
- **Method:** data-flow diagram with trust boundaries → STRIDE per boundary crossing → attacker stories for the 12 required categories → controls (preventive and detective) → verification tests → residual risk.
- **Rating:** Likelihood (L/M/H) × Impact (L/M/H) → Risk (Low / Medium / High / Critical). Ratings are **after** the planned controls.

## 2. Data-flow diagram and trust boundaries

```mermaid
flowchart LR
    subgraph z0["Z0 Internet - untrusted"]
        user["Customer browser"]
        atk["Attacker"]
        pros["Prospect mail client"]
        site["Public websites<br/>untrusted content"]
    end

    subgraph z1["Z1 Edge"]
        cf["Cloudflare proxy<br/>optional"]
        ng["nginx<br/>TLS, rate limits"]
    end

    subgraph z2["Z2 Application - Docker network"]
        web["web"]
        api["api"]
        wk["worker"]
    end

    subgraph z3["Z3 Data - no external ports"]
        pg[("PostgreSQL")]
        kv[("Valkey")]
    end

    subgraph z4["Z4 Third parties - semi-trusted"]
        llm["LLM providers"]
        ver["Verifier"]
        data["BYOK data providers"]
        mbx["Mailbox providers"]
        pay["Payment provider"]
        obj[("Object storage")]
        obs["Observability SaaS"]
    end

    user --> cf --> ng
    atk --> cf
    pros -- "unsubscribe link" --> ng
    ng --> web
    ng --> api
    web --> api
    api --> pg
    api --> kv
    wk --> pg
    wk --> kv
    wk -- "SafeFetch" --> site
    wk --> llm
    wk --> ver
    wk --> data
    wk --> mbx
    mbx -- "replies, untrusted" --> wk
    pay -- "signed webhooks" --> ng
    api --> pay
    api --> obj
    wk --> obj
    api --> obs
    wk --> obs
```

| Boundary | Crossing | Key threats |
|----------|---------|-------------|
| B1 Z0→Z1/Z2 | Browser → API | TM-02, TM-04, TM-05, TM-10, DoS |
| B2 Z2→Z3 | App → DB/Valkey | TM-01, TM-03 |
| B3 Z2→Z0 | Worker → arbitrary websites | TM-06, TM-07 |
| B4 Z4→Z2 | Mail replies, provider responses, webhooks → worker/api | TM-07, TM-09, TM-04 |
| B5 Z2→Z4 | App → LLM, verifier, payment, observability | TM-12 (data or secret leakage) |
| B6 Operator → VPS/CI | SSH, GitHub Actions | TM-12, supply chain |
| B7 Platform → prospects | Outreach email | TM-11 |

## 3. Threat actors

| Actor | Capability | Motivation |
|-------|-----------|-----------|
| External attacker | Internet access, automation, credential lists | Data theft (prospect lists, mailbox tokens), spam relay, ransom |
| Malicious tenant user | Valid account in their own workspace, possibly a Member | Access other tenants' data, escalate privileges, abuse sending |
| Abusive customer | Paid or trial account | Spam, purchased lists, phishing |
| Content attacker | Controls a website or sends an email to a customer's mailbox | Prompt injection, XSS, SSRF via URLs |
| Compromised dependency or vendor | Code execution in build or runtime, or vendor breach | Secret theft, backdoor |
| Insider or operator mistake | SSH or Super Admin access | Accidental exposure, misuse |

## 4. Threats

---

### TM-01: Cross-tenant data access
**Risk after controls: Medium** (L: Low, I: High). Highest-impact class for a multi-tenant SaaS.

**Attack scenarios**
1. A member of workspace B changes an ID in a URL or body to a resource of workspace A (IDOR).
2. A bug in a new repository method queries without a workspace filter.
3. A job runs with the wrong workspace (envelope mix-up) and writes A's data into B's view.
4. Cache key collision returns A's dashboard to B.
5. A nested write links B's enrollment to A's contact.
6. An AI prompt for B accidentally includes A's facts.

**Preventive controls:** path-scoped tenancy + `TenantGuard` (404 for non-members) · strict body schemas (no `workspaceId` from clients) · `TenantPrisma` extension (auto-scope, compound unique selectors required) · **composite foreign keys** `(workspace_id, fk)` · workspace-prefixed cache keys · job envelopes with `runInJobContext` · AIC-PRE-07 tenancy assertion on AI context · object storage paths + signed URLs after tenant-scoped lookup · `SystemPrisma` only via `withSystemContext(reason)` from allowlisted code · RLS (V1). Details: [09-multi-tenancy.md](09-multi-tenancy.md).

**Detective controls:** `tenant_context_violations_total` (critical alert) · logging of system-context use with reason · audit log of exports · Sentry alerts on `TenantUniqueSelectorRequired`/`TenantContextMissing`.

**Verification:** generated cross-tenant API suite over every `:workspaceId` route (CI-blocking) · repository suite with two workspaces · SQL tests proving composite FKs reject cross-tenant references · lint rules · RLS shadow testing (V1) · external pen test (V1).

**Residual risk:** logic errors in system-context code paths. Mitigated by CODEOWNERS security review on the allowlist and immediate narrowing to a single workspace.

---

### TM-02: Unauthorized API access (authentication or authorization bypass)
**Risk: Medium** (L: Low, I: High)

**Attack scenarios**
1. Calling an endpoint that a developer forgot to protect.
2. A Member performing Owner/Admin actions (billing, export, role change, approving their own launch).
3. Replaying a stolen or revoked session.
4. Accessing `/admin` or Bull Board without being a Super Admin.
5. Mass assignment of `role`/`status` fields.
6. Abusing verbose errors or API docs to map the system.

**Preventive controls:** **default-deny** global `SessionGuard` (routes opt out with `@Public()`) · mandatory `@RequirePermission()` on tenant routes (CI lint `lga/require-authz-decorator`) · permission matrix (SECURITY.md §3.2) checked server-side per request with fresh membership data · launch approval: approvers need `campaigns.approve_launch`, which Members lack, and self-approval isn't possible · strict Zod schemas · `PlatformAdminGuard` (role + TOTP + IP allowlist, also at nginx) · impersonation read-only · session revocation immediate (cache ≤ 60 s) · OpenAPI docs disabled in production · generic 500 messages · step-up for sensitive actions.

**Detective controls:** 401/403 rate metrics and anomaly alerts · audit log of privileged actions · admin-activity notifications.

**Verification:** route-table test that every route has `@Public()` or a permission decorator · a role-matrix test generated from SECURITY.md §3.2 (each permission × each role) · impersonation write-attempt suite · revoked-session test.

**Residual risk:** permission-mapping mistakes in new features. Mitigated by the generated matrix test.

---

### TM-03: SQL injection
**Risk: Low** (L: Low, I: High)

**Attack scenarios**
1. Injecting SQL via search (`?q=`), sort or filter parameters.
2. Injecting via JSONB path filters.
3. A developer using `$queryRawUnsafe` with string concatenation.
4. Second-order injection from imported CSV values later used in raw SQL.

**Preventive controls:** Prisma parameterized queries · tagged-template raw SQL only, `*Unsafe` APIs banned by lint · allowlist maps for sort and identifier choices · fixed JSONB paths in code · `LIKE` escaping and length caps · HMAC-signed cursors (no client-controlled SQL fragments) · least-privilege DB roles (no DDL for app, append-only audit) · `statement_timeout` · [04-database.md](04-database.md) §6.

**Detective controls:** `pg_stat_statements` review · Postgres error-log alerts for syntax errors from the app role · CodeQL SQL-injection queries in CI.

**Verification:** CodeQL + lint gate · fuzz tests on list endpoints (sort, filter, q) with SQL metacharacters · unit tests for the allowlist mapper.

**Residual risk:** minimal.

---

### TM-04: Cross-site scripting (XSS)
**Risk: Low–Medium** (L: Medium for attempts via inbound email, I: High: session context)

**Attack scenarios**
1. A prospect replies with an HTML email containing scripts, event handlers or `javascript:` links, which a user opens in the inbox.
2. A malicious website's content is extracted into a business profile field and rendered.
3. A CSV import contains `<script>` in a company name.
4. AI output contains HTML or JS.
5. Reflected XSS via error messages or the `next` redirect parameter.

**Preventive controls:** server-side HTML sanitization with an allowlist ([07-email-infrastructure.md](07-email-infrastructure.md) §7.4) · rendering **only** inside a sandboxed iframe with `sandbox=""` and a restrictive inner CSP ([01-frontend.md](01-frontend.md) §10) · React auto-escaping everywhere else · `react/no-danger` lint (single exception: `SafeEmailFrame`) · AI outputs treated as plain text (AIC-OUT-10) · nonce-based strict CSP with `object-src 'none'`, `base-uri 'self'` and `frame-ancestors 'none'` · `next` parameter regex allowlist · no user content in `<title>` without escaping.

**Detective controls:** CSP violation reporting (`report-to` endpoint logging counts) · Sentry for frontend errors.

**Verification:** sanitizer test corpus (OWASP XSS cheat-sheet vectors, mXSS cases, SVG payloads) · e2e test that a malicious email renders without script execution (Playwright asserts no dialog or console marker) · CSP presence test.

**Residual risk:** sanitizer bypasses (mXSS). This is contained by the iframe sandbox (no script execution even if markup slips through).

---

### TM-05: Cross-site request forgery (CSRF)
**Risk: Low** (L: Low, I: Medium–High)

**Attack scenarios**
1. A malicious site auto-submits a form to `POST /api/v1/.../campaigns/:id/launch` while the user is logged in.
2. A `fetch` with `credentials: include` from another origin.
3. Login CSRF (forcing a victim to log in to the attacker's account).
4. State changes via GET links in emails.

**Preventive controls:** same-origin architecture · `__Host-` cookie with `SameSite=Lax` · `OriginGuard`: `Origin` must equal the app origin **and** `X-Requested-With: lga-web` on unsafe methods · no CORS headers (preflights fail) · no state changes on GET (lint) · login and OAuth flows use `state` and a signed pre-auth cookie · [08-authentication.md](08-authentication.md) §8.

**Detective controls:** `OriginGuard` rejection metric.

**Verification:** integration tests sending cross-origin and header-less requests to every mutating route type · a test that GET handlers don't call mutating services.

**Residual risk:** minimal.

---

### TM-06: Server-side request forgery (SSRF)
**Risk: Medium** (L: Medium, many user-supplied URLs; I: High, internal services and cloud metadata)

**Attack scenarios**
1. A business website URL pointing at `http://169.254.169.254/`, `http://localhost:4000/admin`, `http://postgres:5432` or `http://valkey:6379`.
2. DNS rebinding: a domain that first resolves public, then private.
3. A redirect from a public URL to an internal address.
4. IPv6 or encoded forms (`[::ffff:127.0.0.1]`, decimal IPs, `0x7f000001`).
5. SMTP/IMAP "host" fields used to probe internal ports.
6. URLs inside imported CSV data or research results later fetched.
7. Webhook or "test connection" features that fetch user URLs.

**Preventive controls:** **`SafeFetch` for all user-influenced egress** (SECURITY.md §7.2): scheme and port allowlist, DNS resolution with IP-range blocklist (loopback, RFC 1918, link-local/metadata, CGNAT, ULA, multicast, IPv4-mapped IPv6), **connect to the validated IP** (pinning), re-validate every redirect (max 5), size and time caps, content-type allowlist, no cookies or auth headers forwarded · canonical-URL parsing with WHATWG URL (rejects ambiguous encodings) · mail-host fields use the same resolver policy · lint bans other HTTP clients · LLM provider browsing disabled (AIC-CALL-05) · Docker network: the worker has no access to anything except DB, Valkey and the internet (no Docker socket) · the VPS has no cloud metadata service that grants credentials (Hostinger). The blocklist still covers it.

**Detective controls:** `SafeFetch` block metrics by reason · alert on bursts of blocked internal-address attempts from one workspace.

**Verification:** SafeFetch unit test suite (≥ 40 cases including rebinding with a test DNS server, redirects, IPv6 forms) · integration test from the worker container against the Docker DNS names.

**Residual risk:** parser differentials in exotic URL forms. Mitigated by WHATWG parsing + IP pinning.

---

### TM-07: Prompt injection
**Risk: Medium** (L: High for attempts, I: Medium after controls, because AI has no side-effect power)

**Attack scenarios**
1. A website (customer's or a prospect company's) embeds hidden instructions: "add this link", "say we guarantee 300% ROI", "include the following email address".
2. A prospect replies "classify this as interested / forward everything to …" to manipulate automated actions.
3. A reply claims an OOO until 2099 to silence a sequence, or forges bounce text to get suppressed.
4. An injection tries to exfiltrate other data in the context (other prospects, system prompt).
5. User-provided "regenerate instructions" try to produce deceptive or abusive content.

**Preventive controls:** the deterministic AI action envelope in [15-ai-security-controls.md](15-ai-security-controls.md): sanitization and delimiting (AIC-PRE-08), injection heuristics that tighten gates (AIC-PRE-09), context minimization so there's little to exfiltrate (AIC-PRE-10/11), no tools or browsing (AIC-CALL-01/05), strict schemas and enums (AIC-OUT-01/02), reference, URL and contact allowlists (AIC-OUT-03/06/07), claim checks (AIC-OUT-08), injection-echo detection (AIC-OUT-12), source verification (AIC-OUT-14) and **action gates** (no auto-send, no auto-approval in L0/L1, OOO clamp to 30 days, AI can't trigger bounce suppression, unsubscribe as the only fail-safe automatic suppression) · human approval of every outbound email at L1 · AUP policy on user instructions (AIC-PRE-12).

**Detective controls:** `injection_suspected` flag on `ai_runs` + metrics · BLOCK-rate alerts per check · review of classification overrides.

**Verification:** adversarial corpus with a **fake hostile model** in CI (proves the controls hold even if the model fully obeys the attacker) · nightly real-model runs · property tests on action gates (doc 15 §9).

**Residual risk:** subtle persuasion in draft wording that passes lint. Accepted, because a human approves every draft at L1 and L2 requires zero warnings plus sampling.

---

### TM-08: Malicious file uploads
**Risk: Low** (L: Medium, I: Low–Medium). Only CSV is accepted in MVP.

**Attack scenarios**
1. Uploading a non-CSV file (executable, HTML, SVG, zip bomb) disguised as `.csv`.
2. Oversized files or rows to exhaust memory or disk.
3. CSV/formula injection (`=HYPERLINK(...)`, `=cmd|...`) that executes when an admin later opens an export in Excel.
4. Path traversal or overwrite via filename (`../../etc/passwd`).
5. Script or HTML in fields that later renders in the UI or enters prompts.
6. Malicious URLs in data that later get fetched.
7. An upload served back with a dangerous content type (stored XSS via file download).

**Preventive controls:** accept only `.csv` with a text sniff of the first 4 KB (reject NUL bytes and binary signatures) · 20 MB limit at nginx and busboy, one file per request, 50,000 rows, 1 MB per row, 200 columns, 10,000 chars per field · **streaming** parse in the worker (bounded memory) · storage under random keys `ws/{id}/imports/{uuid}.csv` (filenames are never used in paths) · private bucket, downloads only via short-lived signed URLs with `Content-Disposition: attachment`, `Content-Type: text/csv` and `X-Content-Type-Options: nosniff` · **formula-injection escaping on every export** (prefix `'` for cells starting `= + - @ \t \r`) · imported text rendered through React escaping and treated as untrusted in prompts (AIC-PRE-08) · URLs from data fetched only through SafeFetch · the lawful-basis attestation requirement reduces illicit list uploads · no images, attachments or archives in MVP. **Future** attachment support requires malware scanning (ClamAV in a separate container or a scanning API) and a new review.

**Detective controls:** upload rejection metrics by reason · import error reports · audit log of imports with uploader.

**Verification:** upload tests with polyglots (HTML/SVG in `.csv`), oversize, CRLF variants, BOMs, formula payloads (export escaping test), traversal filenames.

**Residual risk:** minimal.

---

### TM-09: Webhook spoofing and replay
**Risk: Low** (L: Medium, I: High for billing: free credits or plans)

**Attack scenarios**
1. Forging a `checkout.session.completed` or `invoice.paid` webhook to get credits or a plan for free.
2. Replaying a legitimate captured webhook to double-grant credits.
3. Delivering events out of order (for example, an old `subscription.updated` after a cancellation) to restore access.
4. Forged booking webhooks creating fake meetings (V1).
5. Flooding the webhook endpoint (DoS).

**Preventive controls:** signature verification over the **raw body** with provider secrets and constant-time comparison · timestamp tolerance ±5 min where the provider signs timestamps · `webhook_events UNIQUE (provider, external_id)` dedupe · **idempotent effects**: credit grants unique on `(source, external_ref)`, subscription updates idempotent · **re-fetch the authoritative object from the provider API** before applying state ([10-billing.md](10-billing.md) §6), which defeats forged payload content and ordering issues · amounts and plans never taken from payloads · webhook secrets per environment · nginx rate limit · async processing (the fast 200 response limits the impact of slow processing).

**Detective controls:** `webhook_signature_failures_total` alert · nightly `billing.reconcile` drift alert · audit log for grants.

**Verification:** tests for invalid signature, stale timestamp, duplicate delivery, out-of-order delivery (end state identical), and a forged payload with a valid structure but no matching provider object.

**Residual risk:** provider webhook secret theft. Mitigated by re-fetching (an attacker can't fabricate provider-side objects).

---

### TM-10: Account takeover
**Risk: Medium** (L: Medium, I: High: access to the workspace, mailboxes and prospect data)

**Attack scenarios**
1. Credential stuffing with breached passwords.
2. Phishing for passwords.
3. Password-reset poisoning via a forged `Host` header.
4. Reset or verify token guessing or leakage via Referer.
5. OAuth account-linking abuse (an attacker's IdP account with the victim's email).
6. Email-change takeover.
7. Session hijacking (XSS-stolen cookies, or a stolen device).
8. Invitation token interception.
9. Super Admin account compromise.

**Preventive controls:** argon2id + breached-password rejection · progressive throttling, lockout and **Turnstile** ([08-authentication.md](08-authentication.md) §5) · generic responses (no enumeration) · reset links built from configured `APP_ORIGIN` only · 256-bit single-use hashed tokens with short TTLs, and `Referrer-Policy: strict-origin-when-cross-origin` plus token-in-path pages that immediately exchange and redirect · **OAuth linking requires a verified IdP email + proof of the existing account** · email change with step-up + notify old address with a revert link · `HttpOnly` `__Host-` cookies (not readable by JS) · session rotation on login, rotation on privilege change, revocation on password reset, "sign out all" · new-device login notifications · invitations bound to the invited email (must sign in with it) · **Super Admin: mandatory TOTP + IP allowlist** in MVP · customer 2FA with enforcement option (V1).

**Detective controls:** login-failure and lockout metrics and alerts · new-device emails (user detection) · audit log of security events · impossible-travel heuristic (V1).

**Verification:** tests for enumeration parity, lockout thresholds, reset-poisoning (forged Host ignored), token single-use and expiry, OAuth linking rules, session revocation propagation.

**Residual risk:** phished users without 2FA (MVP). Accepted until V1 2FA. Workspace Owners are encouraged to use Google or Microsoft sign-in, which carries the IdP's MFA.

---

### TM-11: Email abuse
**Risk: Medium** (L: High for attempts, especially trials; I: High for recipients, customer domains and platform reputation)

**Attack scenarios**
1. A spammer signs up (trial) and blasts purchased lists.
2. Sending phishing or deceptive content (impersonating banks or brands).
3. Header injection via subject or display name (CR/LF) to add recipients or headers.
4. Spoofing: sending as domains the user doesn't control.
5. Using the platform as an open relay.
6. Mass unsubscribe of other people (token forgery or enumeration).
7. Harming the shared links domain's reputation.
8. Ignoring opt-outs or emailing strict-consent countries.
9. An AI used to mass-produce deceptive copy.

**Preventive controls:** sending **only** through mailboxes the user authenticated (OAuth or a working SMTP login), so we never relay or spoof · trial limits (1 mailbox, 25/day, 100 total, verified email, Turnstile) · per-mailbox caps, ramp-up, spacing, windows · verified-only recipients (VALID, limited catch-all) · `SendPolicy` SP-01…SP-13 last-mile checks ([07-email-infrastructure.md](07-email-infrastructure.md) §4.1) · suppression at import, enrollment and send · country policy with strict-consent blocks · RFC 8058 one-click unsubscribe with **HMAC tokens** (unforgeable, no enumeration) · `MimeBuilder` rejects CR/LF in headers and sanitizes display names · footer with identity, address and privacy link is injected by code · AUP acceptance, AIC-PRE-12 instruction policy and AIC-OUT-08 claim checks · launch approval for Members · bounce and unsubscribe auto-pause · account standing with auto-flagging (> 5% bounces, > 1% unsubscribes) · Super Admin kill switches · tracking off by default and a separate links domain (ADR-0015) · no SMTP server operated by us (no open-relay surface).

**Detective controls:** platform abuse dashboard (SA-01/02) · bounce-spike alerts · `email_send_blocked_total{reason}` · links-domain reputation monitoring (Google Safe Browsing / blocklist checks, weekly) · abuse report inbox (`abuse@`) with SLA.

**Verification:** `SendPolicy` unit tests for every SP check · header-injection tests · trial-limit tests · unsubscribe token forgery tests · Gate 3 dogfood campaign.

**Residual risk:** a determined low-volume abuser using their own domain within limits. Mitigated by AUP enforcement, standing reviews and reports.

---

### TM-12: Secret leakage
**Risk: Medium** (L: Medium, I: Critical for mailbox tokens and encryption keys)

**Attack scenarios**
1. Secrets committed to git or baked into Docker image layers.
2. Secrets or tokens printed in logs, Sentry events or error responses.
3. `NEXT_PUBLIC_` misuse exposing server secrets in the browser bundle.
4. Database dump or backup theft exposing OAuth tokens and BYOK keys.
5. CI logs or compromised GitHub Actions dependencies exfiltrating secrets.
6. Secrets placed in job payloads (visible in Valkey and Bull Board).
7. Secrets sent to LLM providers inside prompts.
8. BYOK keys displayed back in the UI.
9. VPS compromise reading env files.
10. SSRF to metadata endpoints.

**Preventive controls:** env files only on the server (mode 600), never in images (multi-stage builds, `.dockerignore`, Trivy secret scan) · gitleaks pre-commit + GitHub secret scanning + push protection · pino redaction + Sentry scrubbing + a unit test of redaction ([12-observability.md](12-observability.md) §2.2) · strict `NEXT_PUBLIC_` allowlist in CI · **application-level AES-256-GCM** for OAuth tokens, SMTP passwords, BYOK keys and TOTP secrets, with keys outside the DB (a DB or backup theft alone doesn't reveal credentials) · backups encrypted with an `age` public key (private key offline) · job payloads carry IDs only (envelope schema `.strict()`) · AIC-PRE-11 secret scan of prompts · BYOK keys masked (last 4 only) and never returned by the API · GitHub Actions pinned by commit SHA, least-privilege `permissions:`, environment-scoped secrets with required reviewers for production, OIDC where possible · SSH key-only, firewall, no Docker socket in app containers · SafeFetch blocks metadata IPs · key rotation runbooks (scenario G in [13-backup-recovery.md](13-backup-recovery.md)).

**Detective controls:** secret-scanning alerts · Sentry scrubbing tests · provider-side spend anomaly alerts (AI keys with hard spend limits) · audit of key creation and rotation.

**Verification:** CI gates (gitleaks, Trivy secrets, bundle check), redaction unit test, image inspection test (`docker history` has no secrets), quarterly key-rotation drill for one secret class.

**Residual risk:** full VPS root compromise reveals env keys and therefore stored credentials. Mitigated by hardening, monitoring, minimal attack surface and a rapid rotation runbook. A KMS or HSM is deferred (cost).

---

## 5. Other threats (summary)

| Threat | Rating | Key controls |
|--------|--------|-------------|
| DoS / resource exhaustion | Medium | Cloudflare proxy (free), nginx `limit_req`, per-user and per-workspace throttles, body and size limits, statement timeouts, queue fairness, container memory limits |
| Supply chain (npm, images, Actions) | Medium | Lockfile, pinned versions and digests, Renovate with review, `pnpm audit`, CodeQL, Trivy, minimal runtime images, Actions pinned by SHA |
| Insider or operator misuse | Low | Audited impersonation, Super Admin MFA + IP allowlist, read-only DB role for support, two-person rule for tenant restore |
| Data loss / ransomware | Low | Immutable offsite backups, write-only server credentials, restore drills ([13-backup-recovery.md](13-backup-recovery.md)) |
| LLM or third-party vendor breach | Medium | Data minimization in prompts, no secrets sent, DPAs, BYOK keys encrypted, provider spend limits |
| Privacy non-compliance (unlawful processing) | Medium | Lawful basis, provenance, DSAR tooling, retention jobs, country policy, counsel review |
| Clickjacking | Low | `frame-ancestors 'none'` |
| Open redirect | Low | Relative-path allowlist for `next` |

## 6. Security verification plan (CI and cadence)

| Control area | Test | When |
|-------------|------|------|
| Tenancy (TM-01) | Generated cross-tenant suite, repository suite, FK tests | Every PR (blocking) |
| AuthZ (TM-02) | Route decorator lint, role × permission matrix test | Every PR (blocking) |
| Injection (TM-03) | CodeQL, lint bans, fuzz on list endpoints | Every PR / weekly fuzz |
| XSS (TM-04) | Sanitizer corpus, iframe e2e, CSP test | Every PR |
| CSRF (TM-05) | OriginGuard suite | Every PR |
| SSRF (TM-06) | SafeFetch suite incl. DNS rebinding | Every PR |
| Prompt injection (TM-07) | Adversarial corpus with fake hostile model / real models | Every PR / nightly |
| Uploads (TM-08) | Upload and export escaping suite | Every PR |
| Webhooks (TM-09) | Signature, replay, ordering tests. Stripe test-mode E2E | Every PR / before release |
| ATO (TM-10) | Auth flow suite | Every PR |
| Email abuse (TM-11) | SendPolicy suite, header-injection tests, Gate 3 dogfood | Every PR / Gate 3 |
| Secrets (TM-12) | gitleaks, Trivy, bundle check, redaction test | Every PR |
| Whole system | External penetration test | V1, then annually |

## 7. Maintenance

This model is reviewed at every roadmap gate, after any security incident, and when adding an integration, an AI task, a public endpoint or a file type. Each review updates ratings and adds threats as `TM-13+`.
