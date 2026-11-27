// What each route accepts and returns, using the shared contract schemas (03-api §1).
// Security facts (public, tenant, permission, recent auth, idempotency) come from the route
// table, not from here. test/openapi.test.ts fails when a route is missing from this map or
// an entry no longer matches a route.
import {
  AcceptedResponseSchema,
  AnalyticsSchema,
  AuthIdentitiesResponseSchema,
  BillingSchema,
  CampaignDetailSchema,
  CampaignItemSchema,
  CampaignQuerySchema,
  ChangeEmailRequestSchema,
  ChangeMemberRoleRequestSchema,
  ChangePasswordRequestSchema,
  CompanyDetailSchema,
  CompanyItemSchema,
  ContactDetailSchema,
  ContactItemSchema,
  ContactQuerySchema,
  ConversationDetailSchema,
  ConversationItemSchema,
  ConversationQuerySchema,
  CreateInvitationRequestSchema,
  CreateWorkspaceRequestSchema,
  DeleteWorkspaceRequestSchema,
  EmailOnlyRequestSchema,
  HealthReportSchema,
  IcpOverviewSchema,
  IntegrationsSchema,
  InvitationLookupSchema,
  InvitationSummarySchema,
  LeadItemSchema,
  LeadListDetailSchema,
  LeadListItemSchema,
  LeadQuerySchema,
  ListQuerySchema,
  ListResponse,
  LivenessSchema,
  LoginRequestSchema,
  MeResponseSchema,
  MeetingItemSchema,
  MeetingQuerySchema,
  MemberSummarySchema,
  MembershipSummarySchema,
  OAuthLinkRequestSchema,
  OAuthPendingLinkSchema,
  OAuthProvidersResponseSchema,
  OAuthStartQuerySchema,
  OverviewQuerySchema,
  OverviewSchema,
  Page,
  PasswordResetRequestSchema,
  ProjectFilterSchema,
  ProjectsSchema,
  RangeQuerySchema,
  ReauthenticateRequestSchema,
  SentItemSchema,
  SentQuerySchema,
  SequencesSchema,
  SessionSummarySchema,
  SignupRequestSchema,
  SystemInfoSchema,
  TokenRequestSchema,
  TransferOwnershipRequestSchema,
  UpdateProfileRequestSchema,
  UpdateWorkspaceRequestSchema,
  UserSummarySchema,
  WorkspaceDetailSchema,
  WorkspaceSummarySchema,
} from '@lga/contracts';
import { z } from 'zod';

export type Tag =
  | 'Auth'
  | 'Sign-in providers'
  | 'Profile'
  | 'Workspaces'
  | 'Members'
  | 'Invitations'
  | 'Dashboard'
  | 'System';

export interface RouteDoc {
  summary: string;
  tag: Tag;
  query?: z.ZodObject;
  body?: z.ZodType;
  /** Success body. Omitted for 204s; `redirect` and `html` describe non-JSON answers. */
  response?: z.ZodType | 'redirect' | 'html';
  /** Version-checked update: GET returns an ETag, this route requires If-Match (03-api §7). */
  ifMatch?: boolean;
  /** Served without the /api/v1 prefix. */
  unversioned?: boolean;
}

const UserEnvelope = z.object({ user: UserSummarySchema });

export const ROUTE_DOCS: Record<string, RouteDoc> = {
  // ---- Auth (AUTH-01..05)
  'POST auth/signup': {
    tag: 'Auth',
    summary: 'Create an account and send the verification email',
    body: SignupRequestSchema,
    response: AcceptedResponseSchema,
  },
  'POST auth/verify-email': {
    tag: 'Auth',
    summary: 'Verify the email address with the emailed token and sign in',
    body: TokenRequestSchema,
    response: UserEnvelope,
  },
  'POST auth/verify-email/resend': {
    tag: 'Auth',
    summary: 'Send a new verification email',
    body: EmailOnlyRequestSchema,
    response: AcceptedResponseSchema,
  },
  'POST auth/login': {
    tag: 'Auth',
    summary: 'Sign in with email and password',
    body: LoginRequestSchema,
    response: UserEnvelope,
  },
  'POST auth/logout': { tag: 'Auth', summary: 'Sign out of this session' },
  'POST auth/password/forgot': {
    tag: 'Auth',
    summary: 'Send a password reset email',
    body: EmailOnlyRequestSchema,
    response: AcceptedResponseSchema,
  },
  'POST auth/password/reset': {
    tag: 'Auth',
    summary: 'Set a new password with the emailed token',
    body: PasswordResetRequestSchema,
  },
  'POST auth/reauthenticate': {
    tag: 'Auth',
    summary: 'Confirm the password before a sensitive action (step-up)',
    body: ReauthenticateRequestSchema,
  },
  'GET auth/me': {
    tag: 'Auth',
    summary: 'The signed-in user and their workspaces',
    response: MeResponseSchema,
  },
  'GET auth/sessions': {
    tag: 'Auth',
    summary: 'Active sessions of the signed-in user',
    response: z.object({ data: z.array(SessionSummarySchema), nextCursor: z.null() }),
  },
  'DELETE auth/sessions/:sessionId': { tag: 'Auth', summary: 'Sign out one session' },
  'POST auth/sessions/revoke-others': { tag: 'Auth', summary: 'Sign out every other session' },

  // ---- Google / Microsoft sign-in (AUTH-03)
  'GET auth/providers': {
    tag: 'Sign-in providers',
    summary: 'Enabled sign-in providers',
    response: OAuthProvidersResponseSchema,
  },
  'GET auth/oauth/:provider/start': {
    tag: 'Sign-in providers',
    summary: 'Start an OIDC sign-in (redirects to the provider)',
    query: OAuthStartQuerySchema,
    response: 'redirect',
  },
  'GET auth/oauth/:provider/callback': {
    tag: 'Sign-in providers',
    summary: 'Provider callback (redirects back into the app)',
    response: 'redirect',
  },
  'GET auth/oauth/link': {
    tag: 'Sign-in providers',
    summary: 'The pending account link waiting for a password',
    response: OAuthPendingLinkSchema,
  },
  'POST auth/oauth/link': {
    tag: 'Sign-in providers',
    summary: 'Link the provider identity after confirming the account password',
    body: OAuthLinkRequestSchema,
    response: z.object({ user: UserSummarySchema, next: z.string().nullable() }),
  },
  'POST auth/oauth/link/confirm': {
    tag: 'Sign-in providers',
    summary: 'Link the provider identity with the emailed confirmation token',
    body: TokenRequestSchema,
    response: UserEnvelope,
  },
  'GET auth/oauth/fake/:provider': {
    tag: 'Sign-in providers',
    summary: 'Fake identity provider sign-in page (fake mode only)',
    response: 'html',
  },
  'GET auth/oauth/fake/:provider/authorize': {
    tag: 'Sign-in providers',
    summary: 'Fake identity provider authorize step (fake mode only)',
    response: 'redirect',
  },

  // ---- Profile (AUTH-06)
  'PATCH auth/me': {
    tag: 'Profile',
    summary: 'Update name and time zone',
    body: UpdateProfileRequestSchema,
  },
  'POST auth/password/change': {
    tag: 'Profile',
    summary: 'Change the password (signs out other sessions)',
    body: ChangePasswordRequestSchema,
  },
  'POST auth/email/change': {
    tag: 'Profile',
    summary: 'Start an email change (link sent to the new address)',
    body: ChangeEmailRequestSchema,
    response: AcceptedResponseSchema,
  },
  'POST auth/email/confirm': {
    tag: 'Profile',
    summary: 'Confirm an email change with the emailed token',
    body: TokenRequestSchema,
  },
  'POST auth/email/revert': {
    tag: 'Profile',
    summary: 'Undo an email change from the old address',
    body: TokenRequestSchema,
  },
  'GET auth/identities': {
    tag: 'Profile',
    summary: 'Connected Google / Microsoft sign-in methods',
    response: AuthIdentitiesResponseSchema,
  },
  'DELETE auth/identities/:identityId': {
    tag: 'Profile',
    summary: 'Disconnect a sign-in method (never the last one)',
  },

  // ---- Workspaces (WS-01, WS-06, WS-07)
  'POST workspaces': {
    tag: 'Workspaces',
    summary: 'Create a workspace (the creator becomes Owner, trial starts)',
    body: CreateWorkspaceRequestSchema,
    response: WorkspaceSummarySchema,
  },
  'GET workspaces': {
    tag: 'Workspaces',
    summary: 'Workspaces the user belongs to',
    response: ListResponse(MembershipSummarySchema),
  },
  'GET workspaces/:workspaceId': {
    tag: 'Workspaces',
    summary: 'Workspace details and settings (sends an ETag)',
    response: WorkspaceDetailSchema,
  },
  'PATCH workspaces/:workspaceId': {
    tag: 'Workspaces',
    summary: 'Update workspace settings',
    body: UpdateWorkspaceRequestSchema,
    response: WorkspaceDetailSchema,
    ifMatch: true,
  },
  'DELETE workspaces/:workspaceId': {
    tag: 'Workspaces',
    summary: 'Schedule the workspace for deletion (30-day restore window)',
    body: DeleteWorkspaceRequestSchema,
    response: WorkspaceDetailSchema,
  },
  'POST workspaces/:workspaceId/restore': {
    tag: 'Workspaces',
    summary: 'Restore a workspace scheduled for deletion',
    response: WorkspaceDetailSchema,
  },

  // ---- Members (WS-04, WS-05)
  'GET workspaces/:workspaceId/members': {
    tag: 'Members',
    summary: 'Members of the workspace',
    response: ListResponse(MemberSummarySchema),
  },
  'PATCH workspaces/:workspaceId/members/:memberId': {
    tag: 'Members',
    summary: "Change a member's role",
    body: ChangeMemberRoleRequestSchema,
    response: MemberSummarySchema,
  },
  'DELETE workspaces/:workspaceId/members/:memberId': {
    tag: 'Members',
    summary: 'Remove a member, or leave the workspace',
  },
  'POST workspaces/:workspaceId/transfer-ownership': {
    tag: 'Members',
    summary: 'Transfer ownership to an Admin',
    body: TransferOwnershipRequestSchema,
  },

  // ---- Invitations (WS-03)
  'GET workspaces/:workspaceId/invitations': {
    tag: 'Invitations',
    summary: 'Pending invitations',
    response: ListResponse(InvitationSummarySchema),
  },
  'POST workspaces/:workspaceId/invitations': {
    tag: 'Invitations',
    summary: 'Invite someone by email',
    body: CreateInvitationRequestSchema,
    response: InvitationSummarySchema,
  },
  'POST workspaces/:workspaceId/invitations/:invitationId/resend': {
    tag: 'Invitations',
    summary: 'Resend an invitation email',
    response: InvitationSummarySchema,
  },
  'DELETE workspaces/:workspaceId/invitations/:invitationId': {
    tag: 'Invitations',
    summary: 'Revoke an invitation',
  },
  'GET invitations/lookup': {
    tag: 'Invitations',
    summary: 'What an invitation link is for (masked email)',
    query: z.object({ token: z.string() }),
    response: InvitationLookupSchema,
  },
  'POST invitations/accept': {
    tag: 'Invitations',
    summary: 'Accept an invitation',
    body: TokenRequestSchema,
    response: MembershipSummarySchema,
  },

  // ---- Dashboard read models (ADR-0035, ADR-0036)
  'GET workspaces/:workspaceId/overview': {
    tag: 'Dashboard',
    summary: 'Performance overview',
    query: OverviewQuerySchema,
    response: OverviewSchema,
  },
  'GET workspaces/:workspaceId/projects': {
    tag: 'Dashboard',
    summary: 'Projects (business profiles) with their campaigns',
    response: ProjectsSchema,
  },
  'GET workspaces/:workspaceId/sent': {
    tag: 'Dashboard',
    summary: 'Sent messages',
    query: SentQuerySchema,
    response: Page(SentItemSchema),
  },
  'GET workspaces/:workspaceId/sequences': {
    tag: 'Dashboard',
    summary: 'Email sequences per campaign',
    query: ProjectFilterSchema,
    response: SequencesSchema,
  },
  'GET workspaces/:workspaceId/analytics': {
    tag: 'Dashboard',
    summary: 'Analytics for a date range',
    query: RangeQuerySchema,
    response: AnalyticsSchema,
  },
  'GET workspaces/:workspaceId/leads': {
    tag: 'Dashboard',
    summary: 'Leads',
    query: LeadQuerySchema,
    response: Page(LeadItemSchema),
  },
  'GET workspaces/:workspaceId/companies': {
    tag: 'Dashboard',
    summary: 'Companies',
    query: ListQuerySchema,
    response: Page(CompanyItemSchema),
  },
  'GET workspaces/:workspaceId/companies/:companyId': {
    tag: 'Dashboard',
    summary: 'One company',
    response: CompanyDetailSchema,
  },
  'GET workspaces/:workspaceId/contacts': {
    tag: 'Dashboard',
    summary: 'Contacts',
    query: ContactQuerySchema,
    response: Page(ContactItemSchema),
  },
  'GET workspaces/:workspaceId/contacts/:contactId': {
    tag: 'Dashboard',
    summary: 'One contact',
    response: ContactDetailSchema,
  },
  'GET workspaces/:workspaceId/lead-lists': {
    tag: 'Dashboard',
    summary: 'Lead lists',
    response: ListResponse(LeadListItemSchema),
  },
  'GET workspaces/:workspaceId/lead-lists/:listId': {
    tag: 'Dashboard',
    summary: 'One lead list',
    response: LeadListDetailSchema,
  },
  'GET workspaces/:workspaceId/icps': {
    tag: 'Dashboard',
    summary: 'Ideal customer profiles',
    response: IcpOverviewSchema,
  },
  'GET workspaces/:workspaceId/campaigns': {
    tag: 'Dashboard',
    summary: 'Campaigns',
    query: CampaignQuerySchema,
    response: Page(CampaignItemSchema),
  },
  'GET workspaces/:workspaceId/campaigns/:campaignId': {
    tag: 'Dashboard',
    summary: 'One campaign',
    response: CampaignDetailSchema,
  },
  'GET workspaces/:workspaceId/conversations': {
    tag: 'Dashboard',
    summary: 'Inbox conversations',
    query: ConversationQuerySchema,
    response: Page(ConversationItemSchema),
  },
  'GET workspaces/:workspaceId/conversations/:conversationId': {
    tag: 'Dashboard',
    summary: 'One conversation',
    response: ConversationDetailSchema,
  },
  'GET workspaces/:workspaceId/meetings': {
    tag: 'Dashboard',
    summary: 'Meetings',
    query: MeetingQuerySchema,
    response: z.object({ data: z.array(MeetingItemSchema), nextCursor: z.null() }),
  },
  'GET workspaces/:workspaceId/integrations': {
    tag: 'Dashboard',
    summary: 'Connected integrations',
    response: IntegrationsSchema,
  },
  'GET workspaces/:workspaceId/billing': {
    tag: 'Dashboard',
    summary: 'Plan, usage and credits',
    response: BillingSchema,
  },

  // ---- System
  'GET health/live': {
    tag: 'System',
    summary: 'Liveness',
    response: LivenessSchema,
    unversioned: true,
  },
  'GET health/ready': {
    tag: 'System',
    summary: 'Readiness (503 when a dependency is down)',
    response: HealthReportSchema,
    unversioned: true,
  },
  'GET system/info': { tag: 'System', summary: 'Build information', response: SystemInfoSchema },
};
