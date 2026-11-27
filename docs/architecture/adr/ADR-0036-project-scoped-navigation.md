# ADR-0036: Project-scoped navigation and dashboard (Explee-style)

- **Status:** Accepted · **Date:** 2026-11-27 · **Supersedes:** ADR-0035 §Web navigation (sidebar groups, Overview layout) · **Amends:** 01-frontend.md §3, ARCHITECTURE.md §9.2

## Context
The owner wants the product to work like explee.com, an "auto-GTM" app built around a **project** (one website). Its main pieces are:
- a sidebar listing the project's campaigns, a Mailbox group (Inbox, Sent) and a Setup group (Project docs, Channels, Email sequence);
- a dashboard titled with the project's domain, with Performance cards (Sent, Delivered, Hot leads, Spent) filtered by campaign and date range, each compared with the previous period;
- a floating "Get started N of M" checklist.

ADR-0035 shipped a static 13-section sidebar and a generic Overview. Our schema already matches the project model: every `campaigns` row belongs to a `business_profiles` row, and a business profile is a website with a domain.

The owner also asked for LinkedIn lead finding and message automation. The decision is **compliant LinkedIn only**:
- LinkedIn profile URLs come from licensed data providers (Phase 2).
- Sequences can include manual LinkedIn task steps that the user sends from their own account (Phase 3).
- There is no scraping and no automated LinkedIn actions; the AGENTS.md rule stays.

## Decision

### Information architecture
- **Project = business profile.** It is shown by its domain. No schema change.
- **Sidebar:**
  - project switcher;
  - Dashboard;
  - the project's campaigns, each with a status colour bar. The first 4 show, then "Show N more", then "All campaigns" and a "New campaign" `ComingSoon`.
  - **Leads:** Find leads, Companies, Contacts, Lead lists.
  - **Mailbox:** Inbox (with an unread badge), Sent, Meetings.
  - **Setup:** Project docs, Channels, Email sequences.
  - Analytics, Billing and Settings.
  - An account menu, which now also holds the workspace switcher and the theme.
  - The sidebar collapses to an icon rail; the preference lives in localStorage.
- **Routes:** the ADR-0035 paths are kept and only the labels change: `/icp` is "Project docs" and `/integrations` is "Channels". New routes: `/sent` and `/sequences`.
- **Selected project:** the `lga_project_<workspaceId>` cookie, set client-side. Server Components read it, and a missing or stale value falls back to the first project. The cookie is only a preference: the API re-validates every `project` id inside the tenant, so a forged value gives a 404.
- **Scope:**
  - Project-scoped: Dashboard, Campaigns, Sent, Email sequences.
  - Workspace-wide: Inbox, leads, Meetings, Analytics, Billing, Settings. Conversations and leads are not tied to a single profile today.
- **Mobile:** the top bar carries the project switcher. The bottom nav is Dashboard, Inbox, Campaigns, Find leads and More.

### Read models (API, TenantGuard GETs, tenant client)
- **`GET projects`:** profiles with up to 50 campaigns each, plus the workspace unread-thread count.
- **`GET overview?range&project&campaign`:**
  - Filters resolve to campaign ids through `resolveCampaignScope` (`platform/tenancy/campaign-scope.ts`).
  - Unknown or foreign ids, and a campaign from another project, get 404.
  - The KPIs and series respect the filter.
  - A new `performance` block holds four metrics. Each has a value, the previous-period value, the change and a daily series in the workspace time zone:
    - **Sent:** SENT events.
    - **Delivered:** SENT minus BOUNCED (hard bounces). It is `null` when nothing was sent.
    - **Hot leads:** distinct contacts with a POSITIVE_REPLY event.
    - **Credits used:** SETTLED `CREDITS` rows in `usage_ledger`, ÷1000.
      - We show credits, not money, because customers pay in credits.
      - The ledger has no campaign link, so this metric is flagged `scope: 'workspace'` when filters are applied.
- **`GET sent?project&campaign&cursor`:** OUTBOUND messages with status SENT, keyset-paginated. No bodies. A row opens the inbox thread (`inbox?c=<conversationId>`).
- **`GET sequences?project`:** campaigns with ordered steps (type, delay, intent, subject template). No bodies or AI instructions.
- **`GET campaigns?project`:** an optional project filter.

### UI details
- **Dashboard:** an h1 with the domain, then a dismissible "next step" banner from the first unfinished WS-08 checklist step. Below that:
  - a "Performance" section with a campaign select and a range select (default 7d), both URL params;
  - a 2×2 grid of performance cards: a big number, ▲/▼ change "vs prev 7d" and a lazy Recharts line;
  - an Engagement section with the rate KPIs and Needs attention.
- **Get started:** a floating pill, "Get started · progress · N of M", that expands into the checklist and hides when everything is done.
- **Brand:** our own name, logo and zinc and emerald tokens; no Explee branding or copy. Dark mode is fully styled, and the default theme remains "system".

## Alternatives considered
- **Project in the URL (`/[ws]/p/[projectId]/…`), like Explee:** shareable, but it would duplicate every route and break ADR-0035 links. The cookie keeps routes stable, and the API still validates the id.
- **A dashboard per workspace with a project filter only:** loses Explee's "the project is the home" feel that the owner asked for.
- **Showing money for Spent:** customers pay in credits, so a dollar figure would need per-action prices and FX that we don't have.

## Consequences
- ➕ The app reads as a project-centred GTM tool, and each campaign is one click from the sidebar.
- ➕ No migration. The new reads reuse the tenant client, cursors and metric helpers.
- ➖ The selected project is a per-browser preference: opening a link on another device shows that device's project.
- ➖ The performance block aggregates events per request, like ADR-0035. The rollup tables (ADR-0025) replace this before volumes grow.

## Verification
- API integration tests:
  - performance numbers equal hand-counted fixtures (Delivered = sent − bounced; distinct hot leads; settled credits only);
  - an empty project gives null Delivered;
  - foreign or mismatched filters get 404;
  - Sent and sequences responses contain no bodies;
  - READ_ONLY access and the outsider 404 for every new route.
- Web unit tests:
  - the project cookie;
  - the sidebar campaign "Show N more" toggle;
  - performance card states;
  - the Get started progress and toggle;
  - a navigation config with no dead links and no LinkedIn destination.
