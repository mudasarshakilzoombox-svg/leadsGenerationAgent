import type { Prisma } from '../generated/prisma/client.js';

/**
 * Which module may WRITE each table (DATABASE_DESIGN §3, AGENTS.md "each table has exactly one
 * owning module"). Keys are module directory names under `src/modules/` (current and planned).
 * Reads are not restricted here: read models (ADR-0035) query across tables.
 *
 * `infra/scripts/check-ownership.mjs` (part of `pnpm boundaries`) fails when code in
 * `src/modules/<m>/` creates, updates or deletes a model whose owners do not include `<m>`.
 * `satisfies Record<Prisma.ModelName, …>` makes a new model fail to typecheck until it has an owner.
 * Non-module writers (catalog sync, seed, AiGateway metering, the reconciler framework) live
 * outside `src/modules/` and are owned by the platform layer.
 */
export const MODEL_OWNERS = {
  User: ['identity'],
  AuthIdentity: ['identity'],
  Session: ['identity'],
  VerificationToken: ['identity'],
  PasswordReset: ['identity'],
  Plan: ['catalog'],
  Role: ['catalog'],
  Workspace: ['workspaces'],
  WorkspaceMember: ['workspaces'],
  Invitation: ['workspaces'],
  Subscription: ['billing'],
  Entitlement: ['billing'],
  CreditGrant: ['billing'],
  UsageLedger: ['billing'],
  PaymentEvent: ['billing'],
  AiRun: ['ai'],
  BusinessProfile: ['business-profile'],
  Offering: ['business-profile'],
  WebsiteAnalysis: ['business-profile'],
  Icp: ['icp'],
  TargetSegment: ['icp'],
  Company: ['prospecting', 'enrichment'],
  Contact: ['prospecting', 'enrichment', 'verification'],
  Lead: ['prospecting', 'scoring'],
  LeadScore: ['scoring'],
  LeadActivity: ['scoring'],
  LeadList: ['prospecting'],
  LeadListMember: ['prospecting'],
  DataSource: ['prospecting'],
  FieldProvenance: ['prospecting', 'enrichment'],
  ProviderConnection: ['integrations'],
  ImportBatch: ['prospecting'],
  SendingDomain: ['mailboxes'],
  InboxConnection: ['mailboxes'],
  Campaign: ['campaigns'],
  CampaignStep: ['campaigns'],
  CampaignMailbox: ['campaigns'],
  CampaignApproval: ['campaigns'],
  CampaignRecipient: ['campaigns'],
  MessageDraft: ['campaigns'],
  Conversation: ['email-engine', 'inbox'],
  Message: ['email-engine', 'inbox'],
  MessageEvent: ['email-engine'],
  Suppression: ['compliance'],
  Unsubscribe: ['compliance'],
  ReplyClassification: ['inbox'],
  CalendarConnection: ['meetings'],
  Meeting: ['meetings'],
  WebhookEvent: ['integrations'],
  AuditLog: ['audit'],
  BackgroundJob: ['jobs'],
} as const satisfies Record<Prisma.ModelName, readonly string[]>;
