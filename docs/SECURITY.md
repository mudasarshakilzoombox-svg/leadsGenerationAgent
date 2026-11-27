# Security and Privacy

> Status: **Proposed. Awaiting approval.** Synced with PRD v2.0 on 2026-11-26 (three workspace roles, launch approvals, billing, launch markets).
> This document defines mandatory security and privacy controls. Items marked **[MVP]** are required before the first external customer, and **[GA]** before general availability.
> This is not legal advice. Compliance positions (§10) must be reviewed by qualified counsel in the jurisdictions you operate in and target.

---

## 1. Security Objectives

1. **No cross-tenant data exposure.** This is the most important property of the system.
2. **Protect mailbox access.** Connected Gmail and Microsoft 365 tokens give read and send access to customers' business mail. They are the highest-value secrets the platform holds.
3. **Prevent platform abuse** (spam, scraping, harassment). Abuse damages recipients, our customers' domains and our own reputation and provider access.
4. **Lawful processing of prospect data**, which is personal data about people who did not sign up for our product.
5. **AI safety:** untrusted content (websites, replies) must never control actions, and AI output must not fabricate claims.

---

## 2. Threat Model

### 2.1 Assets

| Asset | Sensitivity |
|-------|------------|
| Mailbox OAuth tokens, SMTP/IMAP passwords | Critical |
| Data-provider API keys (BYOK), platform AI and verification keys | Critical |
| Session tokens, password hashes, MFA secrets | Critical |
| Prospect personal data (names, business emails, titles) | High |
| Email content (sent and received) | High |
| Customer business data (ICP, strategy, campaign copy) | Medium–High |
| Audit logs | Medium (integrity matters) |
| Backups | Critical (they contain all of the above) |

### 2.2 Threat actors

External attackers, malicious or compromised tenant users, abusive customers (spammers), prompt-injection authors (hostile websites and email senders), compromised third-party dependencies, and insiders with server access.

### 2.3 Top threats and mitigations

> The **detailed threat model** (data-flow diagram, trust boundaries, TM-01 to TM-12 with attack scenarios, controls, tests and residual risk) is in [architecture/14-threat-model.md](architecture/14-threat-model.md). The deterministic AI checks are in [architecture/15-ai-security-controls.md](architecture/15-ai-security-controls.md). The table below is a summary.

| # | Threat | Mitigation (section) |
|---|--------|---------------------|
| T1 | IDOR / cross-tenant read or write | Tenant guard, Prisma tenancy extension, compound keys, cross-tenant test suite, RLS later (§3.3) |
| T2 | Account takeover (credential stuffing, phishing) | argon2id, rate limits, breached-password check, MFA, session revocation, login alerts (§3.1) |
| T3 | Theft of mailbox tokens or provider keys | Field-level AES-256-GCM encryption, key outside DB, least-privilege scopes, no secrets in logs or jobs (§5) |
| T4 | SSRF through website analysis or user URLs | `SafeFetch`: DNS-resolved IP allowlist, blocks private and metadata ranges, redirect re-validation, size and time limits (§7.2) |
| T5 | Prompt injection via crawled sites or inbound replies | Untrusted-content isolation, no side-effect tools, schema-constrained outputs, human gates (§8) |
| T6 | Platform used for spam | Verified mailboxes only, caps, ramp-up, bounce and complaint auto-pause, suppression enforcement, AUP, account standing (§9) |
| T7 | Stored XSS via inbound email HTML or AI output | Server-side sanitization, sandboxed iframe, CSP, React escaping (§7.3) |
| T8 | CSV/formula injection in exports | Prefix-escape `= + - @ \t \r` in exported cells (§7.4) |
| T9 | Webhook spoofing or replay | Signature verification, timestamp tolerance, idempotency table (§7.6) |
| T10 | Dependency or supply-chain compromise | Lockfile, pinned versions, Renovate, `pnpm audit`, CodeQL, Trivy, minimal images (§13) |
| T11 | VPS compromise | Hardening, key-only SSH, firewall, no public DB ports, non-root containers, monitoring (§11) |
| T12 | Data loss | Offsite encrypted backups, point-in-time recovery, restore drills (§14) |
| T13 | Insider or support misuse | Super-admin MFA, time-boxed audited impersonation, least-privilege DB roles (§3.4) |
| T14 | Sensitive data leakage to LLM providers | Data minimization in prompts, DPAs, no-training API terms, zero-retention where available (§8.4) |

---

## 3. Identity and Access

### 3.1 Authentication [MVP]

| Control | Specification |
|---------|--------------|
| Password hashing | argon2id (memory ≥19 MiB, iterations ≥2, parallelism 1, per OWASP guidance), with rehash on login when parameters increase |
| Password policy | Length 12–128, no composition rules. Reject passwords found in breach corpora (HIBP k-anonymity range API, fail-open on outage) |
| Email verification | Required before connecting mailboxes, spending credits or sending |
| Login throttling | Per account + IP: 5 failures per 15 min triggers exponential delay. Per IP: nginx `limit_req`. Generic error messages (no user enumeration) |
| OAuth login | Google and Microsoft OIDC with PKCE, `state` and `nonce`. Account linking only to a verified email that matches the IdP-verified email |
| Sessions | 256-bit random token in `__Host-lga_session` cookie (`HttpOnly; Secure; SameSite=Lax; Path=/`). SHA-256 hash stored server-side. Idle 7 days, absolute 30 days. Rotated on login, MFA step-up and role change. "Sign out all sessions" available |
| MFA | **[MVP] TOTP mandatory for `SUPER_ADMIN`** (admin login path only). **[V1]** customer TOTP (RFC 6238) plus 10 single-use recovery codes (hashed), with a workspace setting to enforce MFA for Owners and Admins (PRD AUTH-07). Passkeys/WebAuthn later |
| Bot defense [MVP] | Cloudflare Turnstile (free) on signup always, and on login after repeated failures ([architecture/08](architecture/08-authentication.md) §5) |
| Password reset | Single-use token, 30 min TTL, hashed at rest. All sessions revoked on reset. Notification email sent |
| Sensitive re-auth | Re-enter password or MFA for: changing email, deleting workspace, exporting contacts, rotating API keys, disconnecting all mailboxes |
| Login notifications | Email on new-device login and on password or MFA changes |

### 3.2 Authorization (RBAC) [MVP]

Permissions are checked in code with `@RequirePermission(...)`. Roles map to permission sets. This matrix implements PRD §4.2.

| Permission | Super Admin¹ | Owner | Admin | Member | Read-only⁴ |
|-----------|:-----------:|:-----:|:-----:|:------:|:---------:|
| `platform.workspaces.manage` (view all, standing, suspend, credit adjustments, limit overrides) | ✅ | — | — | — | — |
| `platform.killswitch` (pause sending globally, per workspace or per mailbox, disable AI or a provider) | ✅ | — | — | — | — |
| `platform.impersonate` (read-only, time-boxed, audited) | ✅ | — | — | — | — |
| `workspace.delete`, `workspace.transfer_ownership` | — | ✅ | — | — | — |
| `billing.manage` (plan, payment method, invoices, credit packs) | — | ✅ | — | — | — |
| `members.manage` (invite, role change among Admin/Member/Read-only, remove. Never the Owner) | — | ✅ | ✅ | — | — |
| `workspace.settings` (address, privacy notice, defaults, launch-approval toggle) | — | ✅ | ✅ | — | — |
| `integrations.manage` (BYOK data keys, calendars, booking tools) | — | ✅ | ✅ | — | — |
| `mailboxes.connect_own` | — | ✅ | ✅ | ✅ | — |
| `mailboxes.manage_all`, `sending_domains.manage` | — | ✅ | ✅ | — | — |
| `compliance.manage` (suppressions, country policy, DSAR) | — | ✅ | ✅ | — | — |
| `audit.view` | — | ✅ | ✅ | — | — |
| `contacts.export` (CSV exports of leads, results, meetings) | — | ✅ | ✅ | — | — |
| `business.edit`, `icp.edit` | — | ✅ | ✅ | ✅ | — |
| `prospects.discover`, `prospects.import`, `contacts.enrich`, `contacts.verify` (spend credits) | — | ✅ | ✅ | ✅ | — |
| `campaigns.edit`, `drafts.generate` | — | ✅ | ✅ | ✅ | — |
| `drafts.approve` | — | ✅ | ✅ | ✅² | — |
| `campaigns.launch` | — | ✅ | ✅ | ✅³ | — |
| `campaigns.submit_for_approval` | — | ✅ | ✅ | ✅ | — |
| `campaigns.approve_launch` | — | ✅ | ✅ | — | — |
| `inbox.reply`, `inbox.assign`, `classifications.override` | — | ✅ | ✅ | ✅ | — |
| `meetings.manage` | — | ✅ | ✅ | ✅ | — |
| `analytics.view` | — | ✅ | ✅ | ✅ | ✅ |

¹ Super Admin is a platform role, not a workspace role. It reaches customer data **only** through audited impersonation, never through ordinary membership.
² Members approve drafts only in campaigns they created or are assigned to.
³ Only when the workspace setting `launchRequiresApproval` is OFF. It defaults to ON (PRD WS-06), in which case Members use `campaigns.submit_for_approval`.
⁴ `READ_ONLY` (ADR-0034): membership already allows reading workspace data. Its only permission is `analytics.view`, so it can never change data, spend credits, export or read the audit log, and new write permissions are denied to it by default.

Rules:
- **Exactly one Owner per workspace**, enforced by a partial unique index. Ownership transfer requires re-authentication and swaps roles atomically, so the old Owner becomes Admin.
- Admins cannot remove or demote the Owner.
- Role changes take effect on the next request (permissions are resolved per request from `memberships`) and are audited.
- Removing a member revokes access immediately. Their mailboxes are paused and reassigned to the Owner (PRD WS-04).
- Resource-level ownership rules (for example, Members disconnect only their own mailbox) are enforced in services.
- Future Viewer/Client role: read-only analytics, optionally restricted to specific business profiles.

### 3.3 Tenant isolation [MVP]

See [DATABASE_DESIGN.md §7](DATABASE_DESIGN.md). Mandatory controls:

- All tenant routes are under `/api/v1/workspaces/:workspaceId/`, and `TenantGuard` verifies membership.
- Repositories cannot query tenant tables without `workspaceId`. The Prisma extension throws.
- Entity lookups always use `{ id, workspaceId }`. A 404 (not 403) is returned for other tenants' IDs.
- Background jobs carry `workspaceId` and run inside the workspace context.
- Cache keys are always namespaced: `workspace:{workspaceId}:...`.
- Every new endpoint ships with a cross-tenant test (**PR checklist item**).
- File downloads use short-lived signed URLs bound to workspace and user.
- [GA+] PostgreSQL RLS on high-risk tables.

### 3.4 Platform administration [MVP]

- `SUPER_ADMIN` is a separate platform role, granted only via CLI/DB by an operator. MFA is required, and `/admin` routes are IP-allowlisted at nginx.
- **Impersonation** is read-only by default, time-boxed (30 min), requires a stated reason, is visible to the customer in their audit log, and write actions need an explicit second confirmation.
- Bull Board and other operational UIs are available only behind super-admin auth and the IP allowlist.

---

## 4. Web Security Controls [MVP]

| Control | Implementation |
|---------|---------------|
| CSRF | Same-origin + `SameSite=Lax` cookie + server check that `Origin` (or `Sec-Fetch-Site: same-origin`) matches on all non-GET requests. Unsubscribe POST is exempt (token-authorized, idempotent) |
| CORS | Disabled (same origin). Webhooks don't need CORS |
| CSP | Nonce-based CSP from Next.js middleware: `default-src 'self'`, `script-src 'self' 'nonce-…'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`. Email-preview iframe uses `sandbox` with no scripts |
| Headers | HSTS (1 year, includeSubDomains after verification), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` minimal |
| Input validation | Zod at every API boundary (body, query, params). Strict objects (unknown keys rejected). Length limits on all strings |
| Output | Structured errors (RFC 9457) with no stack traces or SQL in production |
| Rate limiting | nginx per IP plus NestJS throttler (Valkey) per user and workspace. Stricter on auth, discovery, export and AI preview endpoints |
| Clickjacking | `frame-ancestors 'none'` |
| Open redirects | Redirect targets restricted to relative paths or an allowlist |

---

## 5. Secrets and Encryption

### 5.1 Secrets management [MVP]

- Production secrets exist only in `/opt/lga/env/*.env` on the server (mode `600`, owner `deploy`), injected via Compose `env_file`. They are never in images, the repo, CI logs or job payloads.
- CI secrets are kept in GitHub Environments (staging, production) with required reviewers for production.
- A `.env.example` with dummy values is committed, and real `.env*` files are git-ignored. A secret-scanning pre-commit hook (gitleaks) and GitHub secret scanning are enabled.
- Rotation runbook: platform API keys every 12 months or on staff change. Encryption keys follow §5.3.

### 5.2 Encryption in transit [MVP]

TLS 1.2+ (prefer 1.3) at nginx with Let's Encrypt certificates. Internal container traffic stays on a private Docker network with no published ports. All outbound provider calls use HTTPS. SMTP/IMAP require TLS (implicit TLS or STARTTLS, with no plaintext fallback).

### 5.3 Encryption at rest

| Data | Protection |
|------|-----------|
| OAuth tokens, SMTP passwords, BYOK API keys, MFA secrets, DSAR requester emails | **Application-level AES-256-GCM** [MVP]. Random 96-bit IV per value. AAD = `workspace_id‖row id`, which prevents ciphertext swapping between rows or tenants. Stored as `v{keyVersion}:{iv}:{tag}:{ciphertext}` |
| Encryption keys | `APP_ENCRYPTION_KEYS` env (JSON map `{version: base64Key}`) plus `APP_ENCRYPTION_ACTIVE_VERSION`. Rotation adds a new version and a `maintenance.reencrypt` job migrates rows. Old keys are removed after migration |
| Email hashing | HMAC-SHA256 with `EMAIL_HASH_PEPPER` (env, never rotated without a rehash migration) |
| Database volume | Hostinger VPS disks are not assumed to be encrypted. Sensitive fields are protected by app-level encryption. [GA] evaluate LUKS on a data volume |
| Backups | Encrypted with `age` (public key on the server, private key offline) before upload. Object storage bucket is private, versioned and access-keyed per environment [MVP] |

**As implemented (P0.1):** `FieldCrypto` in `packages/core/src/security/field-crypto.ts`, provided by `PlatformServicesModule`. The AAD is `lga-fc-v1|w:{workspaceId or -}|r:{rowId}|f:{column}`: besides the workspace and row it binds the column name, so a ciphertext cannot be moved between columns of one row either. User-level rows (TOTP factors) use `workspaceId: null`. Values are stored as the UTF-8 bytes of the `v{n}:...` string in the existing `bytea` columns, with the version mirrored into `key_version`. Both key rings are validated at boot (exact 32-byte AES keys, HMAC keys ≥ 32 bytes, active id present) and generated by `pnpm run setup`.

### 5.4 Logging hygiene [MVP]

- pino redaction paths include `req.headers.cookie`, `authorization`, `*.password`, `*.token`, `*.accessToken`, `*.refreshToken`, `*.apiKey`, `*.email`, `*.body`, `*.bodyText` and `*.content`.
- Log entity IDs, never email addresses or message content.
- Sentry `beforeSend` scrubs the same fields. Request bodies are not sent to Sentry.

---

## 6. Third-party Credential Handling

| Credential | Scopes / least privilege | Storage | Lifecycle |
|-----------|-------------------------|---------|-----------|
| Google mailbox (Gmail API) | `gmail.send` (sensitive) + `gmail.readonly` or `gmail.modify` (restricted) for reply sync. No Drive or Contacts | `integration_connections` encrypted | Refresh token. Detect `invalid_grant`, then mark the mailbox DISCONNECTED and notify the owner |
| Microsoft mailbox (Graph) | `Mail.Send`, `Mail.ReadWrite` (or `Mail.Read`), `offline_access`, `User.Read` | encrypted | Same |
| SMTP/IMAP | App password or provider-issued credentials | encrypted | Test on connect. Mark ERROR on auth failure |
| Calendars | Free/busy and event create only (`calendar.events` / `Calendars.ReadWrite`, minimal) | encrypted | |
| Data and verification provider keys (BYOK) | Customer-provided | encrypted | Validated on save. Masked in UI (last 4 chars) |
| Platform AI and verification keys | Platform-owned | env | Spend limits configured at the provider |

OAuth flows use PKCE and `state` bound to session and workspace. Redirect URIs are exact-match. Tokens are never sent to the browser.

---

## 7. Application Security Controls

### 7.1 General [MVP]

- Parameterized queries only (Prisma). `$queryRaw` is allowed only with tagged templates and requires review.
- Mass-assignment protection: DTOs are explicit allowlists, and `workspaceId`, `role` and `status` are never taken from the request body.
- Every privileged or data-export action writes an `audit_logs` entry.

### 7.2 SSRF protection: `SafeFetch` [MVP]

All server-side fetches of user-influenced URLs (website analysis, research, link previews, webhook test calls) **must** use `common/safe-fetch`:

1. Allow only `http:` and `https:` schemes, ports 80/443, and no credentials in the URL.
2. Resolve DNS, then reject loopback, RFC 1918, link-local (`169.254.0.0/16`, including cloud metadata), CGNAT (`100.64.0.0/10`), multicast, IPv6 ULA and link-local, `::1` and IPv4-mapped equivalents. Connect to the **resolved IP** (pinning) to defeat DNS rebinding.
3. Allow at most 5 redirects, each re-validated through the same rules.
4. Timeouts: 5 s connect, 15 s total. Max body 2 MB (streamed and aborted beyond). Content types limited to `text/html`, `application/xhtml+xml`, `text/plain`, `application/xml` (sitemaps) and `application/json` (where expected).
5. Respect `robots.txt` with an identifiable User-Agent (`LeadGenAgentBot/1.0 (+https://<domain>/bot)`). Rate limit to 1 request/second per target host.
6. Never forward cookies or auth headers. Never fetch Docker service hostnames (`api`, `postgres`, `valkey`, ...).

**As implemented (P0.1):** `packages/core/src/security/address-policy.ts` (IP and host policy, also for SMTP/IMAP host checks) and `safe-fetch.ts`. Details beyond the list above:
- Only IPv6 global unicast (`2000::/3`) is allowed, minus Teredo, 6to4, documentation and other special-purpose blocks. IPv4-mapped, IPv4-compatible and NAT64 forms are refused outright. A DNS answer is refused if **any** address in it is non-public.
- Single-label hostnames (Docker service names, `localhost`) and `.localhost`, `.local`, `.internal`, `.home.arpa`, `.lan`, `.test` are refused before DNS.
- Connections use `node:http` with a dialer pinned to the validated IP (TLS SNI and certificate checks use the hostname). The 2 MB cap applies to **decoded** bytes (gzip/deflate/br), so compression bombs are cut off. Non-2xx responses return their status without a body. Callers cannot pass headers. `text/xml` is accepted as an alias of `application/xml` for sitemaps.
- Rule 5: the 1 request/second per host spacing is enforced in-process (`IntervalHostThrottle`; the worker is one process). robots.txt is evaluated by the website crawler (Phase 1), which fetches it through SafeFetch, because robots rules apply to crawling, not to every egress call.
- Policy refusals are logged as `safe_fetch_blocked` with the reason and workspace id only, never the URL (TM-06 detective control).
- Global `fetch` and the `undici`, `axios`, `got` and `node-fetch` imports are lint errors in backend packages.

### 7.3 Email and HTML content [MVP]

- Inbound HTML is sanitized server-side (DOMPurify with a strict allowlist, no `<script>`, `<style>`, `<form>`, `on*` handlers or `javascript:` URLs). It is rendered in a sandboxed iframe (`sandbox=""`) with remote images blocked by default (tracking pixels) and a "load images" toggle.
- Outbound AI-generated content is treated as untrusted text. It is rendered via React escaping in the UI, and links in it are validated against the campaign's allowed domains.
- Attachments: inbound attachments are not stored in MVP (only metadata). Outbound attachments are not supported for cold steps.

### 7.4 File uploads and exports [MVP]

- CSV imports only: 20 MB max, MIME and extension check, parsed with a streaming parser, and stored in private object storage with random keys. Imports are processed in the worker.
- A lawful-basis attestation is required on import (stored on `imports`).
- Exports: `contacts.export` permission plus re-auth plus an audit log entry. Cells starting with `= + - @ \t \r` are prefixed with `'`. Download via a signed URL that expires after 15 minutes. The export file is deleted after 24 hours.

### 7.5 Unsubscribe endpoint [MVP]

- The token is HMAC-SHA256 signed (`workspaceId, contactId, campaignId, issuedAt`) with no DB lookup needed to validate it. No expiry (CAN-SPAM requires links to work for at least 30 days, and we never expire them).
- `GET /u/:token` shows a confirmation page with a one-click button. `POST /u/:token` (RFC 8058 `List-Unsubscribe=One-Click`) applies the suppression immediately and idempotently. Neither path requires cookies or JavaScript.
- Mailto unsubscribe replies are detected by the reply classifier (`UNSUBSCRIBE`) and auto-suppressed.
- **As implemented (P0.1):** `UnsubscribeTokens` in `packages/core/src/security/signed-token.ts` (on top of the generic `SignedTokens`). Keys: `UNSUBSCRIBE_TOKEN_KEYS` (JSON key ring) plus `UNSUBSCRIBE_TOKEN_ACTIVE_KEY_ID`, which picks the signing key so a rotation can be rolled back without deleting a key that already signed links. The MAC input is `purpose.payload`, so tokens minted for another purpose never verify as unsubscribe tokens. The endpoint itself ships in Phase 3.

### 7.6 Webhooks [MVP]

Verify provider signatures (Stripe `Stripe-Signature`, Cal.com and Calendly signing secrets) against the **raw** body. Enforce a timestamp tolerance of 5 minutes where provided. Deduplicate on `(provider, external_id)`. Process asynchronously. Unknown event types are stored and ignored.

### 7.7 Billing and credits [MVP]

- **No card data touches our servers.** Use hosted Checkout and the Customer Portal from Stripe (or the merchant of record), which keeps PCI scope to the lightest self-assessment level.
- Subscription state and credit grants change **only** from verified provider webhooks or Super Admin adjustments. Never from client-supplied amounts or plan keys.
- Credit grants are idempotent on `(source, external_ref)`, so a replayed webhook cannot double-grant.
- Credit reservations are made under a row lock, so concurrent jobs cannot overspend. The balance can never go negative (DB CHECK).
- Only the Owner has `billing.manage`. Every plan change, pack purchase and adjustment is audited.

---

## 8. AI Security

### 8.1 Prompt-injection defense [MVP]

Website text, search results, provider data and **every inbound email** are untrusted and may contain instructions aimed at our models.

- **Structural isolation:** untrusted content is passed in a clearly delimited data block, with system instructions saying it is data to analyze and never instructions to follow.
- **No side-effect tools:** LLM calls never have tools that send email, change records, spend credits or fetch arbitrary URLs. All actions are taken by deterministic code after validating the output.
- **Constrained outputs:** Zod-validated JSON with enums (for example, reply categories). Free text (drafts, summaries) is shown to humans or passes lint before it is used.
- **Classifier-only consequences are bounded:** the worst a manipulated classification can do is stop a sequence, which fails safe. It can never send, forward or export.
- **Human gates:** replies to prospects are human-sent in MVP. Outbound drafts are approved at autonomy L1.

### 8.2 Output integrity [MVP]

- The copywriter may only use facts from `research_facts` (with source URLs) and the customer's own business profile. Output includes `factIdsUsed`.
- Lint checks: no unresolved `{{placeholders}}`, length limits, banned and spam-trigger phrases, no URLs outside allowed domains, no prices, guarantees or claims absent from the business profile, and required footer present.
- An optional LLM-judge pass flags unsupported claims (V1).

### 8.3 Abuse via AI [MVP]

- Credits gate every customer-triggered AI action (PRD §8.4), plus a hidden per-workspace AI cost cap and per-user rate limits on regenerate and suggest, to prevent cost-exhaustion attacks.
- Content-policy filter on generation inputs and outputs: refuse harassment, deceptive impersonation and prohibited industries per the AUP.

### 8.4 Data sent to LLM providers [MVP]

- Only the data needed for the task is sent. Prompts never include other prospects' data, credentials or internal IDs beyond what is required.
- Use API tiers whose terms state that inputs are not used for training. Sign provider DPAs. Enable zero-data-retention options where available and contractually needed (Q6 in ARCHITECTURE.md).
- List LLM providers as sub-processors in the customer-facing DPA.
- `ai_runs` payloads are redacted and purged after 30 days.

---

## 9. Email Sending and Anti-abuse Controls [MVP]

| Control | Detail |
|---------|--------|
| Trial limits | No card required, but: verified email, 1 mailbox, **25 emails/day and 100 in total**, 150 credits, 1 active campaign (PRD §8.2) |
| Account standing | `GOOD` / `WARNING` / `RESTRICTED` / `SUSPENDED` on `workspaces.sending_standing`. Workspaces exceeding **5% hard bounces or 1% unsubscribes over 7 days** are auto-flagged to Super Admins and set to `WARNING`. Super Admins can restrict (lower caps) or suspend (no sending or credit spend). The Owner is notified with the reason (PRD SA-02) |
| Domain and mailbox verification | Only mailboxes the user has authenticated via OAuth or a working SMTP login. Sending domain must pass SPF, DKIM and DMARC checks before launch |
| Volume caps | Per-mailbox daily caps (default 30, above 50 needs acknowledgement, hard max 100), ramp-up for new mailboxes (5/day, +3/day), minimum spacing with jitter, monthly email allowance per plan |
| Bounce protection | Only send to `VALID` emails (with `CATCH_ALL` opt-in capped at 10% of daily volume). Re-verify emails older than 60 days. Auto-pause a campaign above 3% hard bounces (rolling 100). Auto-pause a mailbox above 5% hard bounces over 7 days |
| Launch approval | Workspace setting (default ON) requires Owner/Admin approval before a Member's campaign can send. Approvals are audited and invalidated by changes to leads, sequence or mailboxes |
| Complaint and negative-signal protection | Auto-pause on spikes in `UNSUBSCRIBE`, `NOT_INTERESTED` or angry replies. Mailbox provider throttling codes pause the mailbox |
| Suppression | Workspace-wide, checked at import, enrollment and **immediately before each send**. Domain-level suppression for customers and competitors |
| Unsubscribe | RFC 8058 one-click headers plus a visible footer link. Honored immediately (CAN-SPAM allows 10 business days, and we do better) |
| Identification | Accurate From and Reply-To, non-deceptive subject lines (lint), sender physical address in the footer (required workspace setting) |
| Acceptable Use Policy | Prohibits purchased or scraped lists, consumer targeting, deceptive content, and prohibited industries. Violations lead to suspension |
| Monitoring | Platform-level dashboards of bounce, unsubscribe and negative-reply rates per workspace. Auto-flag outliers for review |

Mailbox-provider sender requirements (Gmail/Yahoo since 2024 and Outlook.com since 2025 for high-volume senders) include SPF, DKIM, aligned DMARC, one-click unsubscribe and low spam rates (Gmail: keep below 0.3%, target below 0.1%). We enforce these for every sender regardless of volume.

---

## 10. Privacy and Regulatory Compliance

> Positions here are product design inputs and must be validated by counsel.

### 10.1 Roles

- **Customer data** (users, billing): the Platform is the **controller**.
- **Prospect data** that customers import or discover through the Platform: the **customer is the controller** and the Platform is the **processor**, acting under a DPA. When a customer uses platform-managed data sources, counsel must confirm the role split and the provider's licensing terms.
- Sub-processors (hosting, LLMs, verification, email, monitoring) are listed publicly and in the DPA, with notice before changes.

### 10.2 Regime summary and product controls

| Regime | Key requirements (summary) | Product control |
|--------|---------------------------|-----------------|
| **GDPR / UK GDPR** | Lawful basis (typically legitimate interest for B2B, documented in an LIA). Art. 14 notice to data subjects within one month or at first contact, including the source. Data subject rights. Minimization. Retention limits | `lawful_basis` per contact, LIA template in workspace settings, mandatory privacy-notice link in the footer, `data_provenance` for source disclosure, DSAR workflow, retention jobs |
| **EU ePrivacy (national laws)** | Unsolicited B2B email rules vary by member state. Some (for example Germany) generally require prior consent even for B2B | **Country outreach policy** per recipient country: `ALLOW`, `ALLOW_WITH_WARNING` or `BLOCK_WITHOUT_CONSENT`. Default `BLOCK_WITHOUT_CONSENT` for strict-consent countries. Workspace override requires an Admin attestation (audited) |
| **UK PECR** | B2B email to corporate subscribers is permitted with identification and opt-out. Sole traders and some partnerships are treated as individuals (consent required) | Country policy for GB with a warning about sole traders. Opt-out always present |
| **US CAN-SPAM** | No deceptive headers or subjects, physical postal address, clear opt-out honored within 10 business days, opt-out works for 30+ days | Required workspace physical address, subject lint, permanent unsubscribe links, immediate suppression |
| **US state privacy laws (e.g., CCPA/CPRA)** | B2B contact data is in scope. Rights to know, delete and opt out | DSAR workflow, deletion, service-provider terms in the DPA |
| **Canada CASL** | Consent (express or implied) required. Implied consent can include conspicuously published business addresses relevant to the recipient's role. Identification and unsubscribe required | Country policy CA = `ALLOW_WITH_WARNING` with attestation. Unsubscribe and identification enforced |
| **Australia Spam Act** and others | Consent-based (inferred consent possible) | Country policy defaults to warn or block until reviewed |

The country policy table is maintained in config (`platform/compliance/country-policies.ts`), reviewed by counsel, and versioned. Recipient country comes from contact data.

**Launch defaults (PRD D14, §12):**

| Recipient country | Default policy | Conditions enforced |
|-------------------|---------------|---------------------|
| US | `ALLOW` | CAN-SPAM footer, opt-out, accurate headers |
| GB | `ALLOW` | PECR: corporate subscribers. Warning shown that sole traders and partnerships need consent |
| IE | `ALLOW` | GDPR + ePrivacy: business contacts, opt-out, Art. 14 notice |
| CA | `ALLOW` | CASL: one-time workspace attestation that addresses are conspicuously published and relevant to the recipient's role (implied consent). Identification + unsubscribe |
| AU | `ALLOW` | Spam Act: same inferred-consent attestation as CA. Identification + unsubscribe |
| Strict-consent countries (e.g. DE, AT and others flagged by counsel) | `BLOCK_WITHOUT_CONSENT` | Only contacts with `lawful_basis = CONSENT` can be enrolled |
| All other countries | `ALLOW_WITH_WARNING` | Admin attestation per workspace before enrollment (audited) |
| **Unknown country** | `ALLOW_WITH_WARNING` | Shown as "Country unknown". Enrollment needs the same Admin attestation. Users are prompted to enrich the country first |

### 10.3 Data-subject rights [MVP]

- A public request form or email address for prospects routes to the right workspace (matched by `email_hash` across tenants, notifying each controller workspace) and to platform support.
- Customer Admins handle `dsar_requests` in-app: **access** (export JSON/CSV of all data about the email), **erasure** (procedure in DATABASE_DESIGN.md §8.3), **objection** (suppress).
- SLA: acknowledge within 72 h, complete within 30 days (tracked by `due_at`).

### 10.4 Data collection rules [MVP]

- Prospect data only from (a) licensed providers via their official APIs under their terms, (b) customer imports with a lawful-basis attestation, (c) public company websites for **company-level** facts (respecting robots.txt), and (d) public news via search APIs.
- **Prohibited:** scraping LinkedIn or other platforms whose terms forbid it, guessing-and-probing mailboxes via SMTP from our servers, collecting personal (non-business) emails or phone numbers, and collecting sensitive categories of data (GDPR Art. 9).
- Google Maps/Places data is used only within its terms (no bulk caching of place content).

### 10.5 Customer-facing legal documents (required before launch)

Terms of Service (including subscription, credits, refunds and trial terms), Acceptable Use Policy, Privacy Policy (platform), DPA with SCCs/UK addendum if processing EU/UK data outside them, sub-processor list, cookie notice (minimal: essential cookies only, no third-party trackers in the app), and an LIA template for customers. Acceptance version and time are recorded per user at signup (`users.terms_version_accepted`).

---

## 11. Infrastructure Security

### 11.1 VPS hardening [MVP]

- Ubuntu 24.04 LTS with `unattended-upgrades` for security updates and a reboot window.
- SSH: key-only, `PermitRootLogin no`, `PasswordAuthentication no`, non-default user `deploy`. Optionally restrict to an IP allowlist or WireGuard. fail2ban on sshd.
- Firewall (`ufw` plus the Hostinger panel firewall): allow 22/tcp (restricted), 80/tcp and 443/tcp. Deny everything else inbound.
- Be aware that **Docker bypasses ufw for published ports**. Only nginx publishes ports. Postgres and Valkey have **no** `ports:` mapping.
- Time sync (chrony). Disk usage alerts. 4 GB swap. Log rotation (Docker `local` driver with max-size).

### 11.2 Containers [MVP]

- Minimal base images (`node:24-*-slim` or distroless for runtime), multi-stage builds and no build tools in runtime images.
- Run as non-root (`USER node`), `read_only: true` with tmpfs for `/tmp`, `security_opt: [no-new-privileges:true]`, `cap_drop: [ALL]` (nginx adds only what it needs).
- Pinned image tags (and digests for third-party images). Trivy scan in CI fails on critical CVEs with available fixes.
- Valkey: `requirepass` / ACL user, `protected-mode yes`, dangerous commands renamed or disabled, private network only.
- Postgres: separate roles (migrator, app, readonly), `scram-sha-256` auth, no superuser for the app, private network only.

### 11.3 Access management

- Production SSH access is held by named individuals only, and keys are removed on offboarding.
- No direct production DB access for routine work. Support uses the admin UI. Emergency DB access uses the readonly role, is logged and has a reason recorded.

---

## 12. Logging, Audit and Monitoring

- **Audit events [MVP]:** login (success and failure), MFA changes, session revocation, member and role changes, integration connect/disconnect, mailbox connect/disconnect, campaign launch/pause, autonomy level changes, country policy overrides, exports, imports (with attestation), suppression changes, DSAR actions, impersonation, billing changes, API key lifecycle.
- Audit logs are visible to workspace Owners and Admins in-app, append-only at the DB permission level, and retained for 24 months.
- **Security alerts:** login-failure spikes, new super-admin sessions, impersonation start, mass export, unusual send volume, provider-key errors, WAF/rate-limit spikes, backup failures.

---

## 13. Secure Development Lifecycle

- Branch protection on `main`: PR review required, CI green, no force-push.
- CI security gates: `pnpm audit` (high/critical), CodeQL (JS/TS), gitleaks, Trivy (images), dependency-cruiser (module boundaries, including no provider SDK imports outside adapters).
- Renovate for dependency updates (grouped, weekly, auto-merge patch-level dev deps only).
- PR checklist: tenant scoping and a cross-tenant test, input validation, audit events for privileged actions, no PII in logs, SafeFetch for external URLs, AiGateway for LLM calls, migration safety (expand/contract).
- Threat-model review for each new integration or agent.
- [GA] External penetration test in V1 and annually after that. Google CASA assessment when Gmail OAuth (restricted scopes) goes generally available (deferred per AD-20, see INTEGRATIONS.md §6.2).

---

## 14. Incident Response and Business Continuity

- **Severity levels:** SEV1 (data breach, cross-tenant leak, mass unsolicited send, full outage), SEV2 (partial outage, sending halted), SEV3 (degraded).
- **Kill switches** (super-admin, instant): pause all sending platform-wide, pause one workspace's sending, disable AI generation, disable one provider integration.
- **Breach process:** contain → assess → notify affected controllers (customers) without undue delay so they can meet their GDPR 72-hour regulator deadline. Notify the regulator directly for platform-controlled data. Notify users where required. Post-mortem within 5 business days.
- **Backups:** see ARCHITECTURE.md §17.6. Monthly restore drill with recorded results.
- **Runbooks** (in `infra/runbooks/`, written in Phase 0–6): deploy and rollback, restore from backup, rotate encryption key, revoke compromised provider key, respond to mailbox-provider abuse report, handle DSAR, mass-pause sending.

---

## 15. Launch Security Gates

| Gate | Requirements |
|------|-------------|
| **Launch (MVP, paid beta)** | All [MVP] items above. Cross-tenant suite green. SafeFetch with tests. Encryption of credentials. Backups and one restore drill. ToS/AUP/Privacy/DPA published. Country policy defaults. Kill switches. Billing webhooks verified and idempotent. Credit ledger concurrency test. Launch-approval permission tests |
| **GA / scale-up** | All [GA] items. MFA enforcement option. WAL point-in-time recovery. External pen test with findings remediated. Microsoft publisher verification. Google OAuth verification **and the restricted-scope security assessment (CASA) when Gmail OAuth goes generally available** (deferred per AD-20). Legal review complete. Incident runbooks tested (tabletop) |
