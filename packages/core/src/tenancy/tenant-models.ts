import type { Prisma } from '../generated/prisma/client.js';

/**
 * How each model relates to tenancy. `satisfies Record<Prisma.ModelName, …>` makes this list
 * exhaustive at compile time: a new model does not typecheck until it is classified, and
 * tenant-models.test.ts checks the classification against schema.prisma.
 *
 * - `tenant`:          workspace_id NOT NULL. Scoped by the tenant client.
 * - `tenant-optional`: workspace_id NULL for platform-level rows. The tenant client sees only
 *                      the workspace's own rows.
 * - `catalog`:         global reference data synced from code (plans, roles). Read-only through
 *                      the tenant client.
 * - `global`:          identity and the workspace row itself. Owned by the identity and tenancy
 *                      modules, never reachable through the tenant client.
 * - `system`:          ingest tables resolved to a workspace later (webhooks). System context only.
 */
export type ModelScope = 'tenant' | 'tenant-optional' | 'catalog' | 'global' | 'system';

export const MODEL_SCOPES = {
  User: 'global',
  AuthIdentity: 'global',
  Session: 'global',
  VerificationToken: 'global',
  PasswordReset: 'global',
  Plan: 'catalog',
  Role: 'catalog',
  Workspace: 'global',
  WorkspaceMember: 'tenant',
  Invitation: 'tenant',
  Subscription: 'tenant',
  Entitlement: 'tenant',
  CreditGrant: 'tenant',
  UsageLedger: 'tenant',
  PaymentEvent: 'tenant-optional',
  AiRun: 'tenant-optional',
  BusinessProfile: 'tenant',
  Offering: 'tenant',
  WebsiteAnalysis: 'tenant',
  Icp: 'tenant',
  TargetSegment: 'tenant',
  Company: 'tenant',
  Contact: 'tenant',
  Lead: 'tenant',
  LeadScore: 'tenant',
  LeadActivity: 'tenant',
  LeadList: 'tenant',
  LeadListMember: 'tenant',
  DataSource: 'tenant',
  FieldProvenance: 'tenant',
  ProviderConnection: 'tenant',
  ImportBatch: 'tenant',
  SendingDomain: 'tenant',
  InboxConnection: 'tenant',
  Campaign: 'tenant',
  CampaignStep: 'tenant',
  CampaignMailbox: 'tenant',
  CampaignApproval: 'tenant',
  CampaignRecipient: 'tenant',
  MessageDraft: 'tenant',
  Conversation: 'tenant',
  Message: 'tenant',
  MessageEvent: 'tenant',
  Suppression: 'tenant',
  Unsubscribe: 'tenant',
  ReplyClassification: 'tenant',
  CalendarConnection: 'tenant',
  Meeting: 'tenant',
  WebhookEvent: 'system',
  AuditLog: 'tenant-optional',
  BackgroundJob: 'tenant-optional',
} as const satisfies Record<Prisma.ModelName, ModelScope>;

export type ModelName = keyof typeof MODEL_SCOPES;

function modelsWithScope(...scopes: ModelScope[]): ReadonlySet<ModelName> {
  return new Set(
    (Object.entries(MODEL_SCOPES) as [ModelName, ModelScope][])
      .filter(([, scope]) => scopes.includes(scope))
      .map(([model]) => model),
  );
}

/** Models with a NOT NULL workspace_id. */
export const TENANT_MODELS = modelsWithScope('tenant');
/** Models with a nullable workspace_id (platform-level rows allowed). */
export const TENANT_OPTIONAL_MODELS = modelsWithScope('tenant-optional');
/** Every model the tenant client scopes by workspace. */
export const WORKSPACE_SCOPED_MODELS = modelsWithScope('tenant', 'tenant-optional');

export function modelScope(model: string): ModelScope | undefined {
  return (MODEL_SCOPES as Record<string, ModelScope>)[model];
}
