import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  type Analytics,
  type Billing,
  type CampaignDetail,
  type CampaignItem,
  CampaignQuerySchema,
  type CompanyDetail,
  type CompanyItem,
  type ContactDetail,
  type ContactItem,
  ContactQuerySchema,
  type ConversationDetail,
  type ConversationItem,
  ConversationQuerySchema,
  type IcpOverview,
  type Integrations,
  type LeadItem,
  type LeadListDetail,
  LeadQuerySchema,
  ListQuerySchema,
  type MeetingItem,
  MeetingQuerySchema,
  type Overview,
  OverviewQuerySchema,
  ProjectFilterSchema,
  type Projects,
  RangeQuerySchema,
  type SentItem,
  SentQuerySchema,
  type Sequences,
} from '@lga/contracts';
import {
  AccountQueries,
  type ActiveSession,
  InsightsQueries,
  OutreachQueries,
  type PageResult,
  ProspectsQueries,
  type WorkspaceAccess,
  ZodValidationPipe,
} from '@lga/core';
import type { z } from 'zod';
import { CurrentAccess, CurrentSession, UuidParamPipe } from '../auth/request-context.js';
import { TenantGuard } from '../auth/tenant.guard.js';

/**
 * Read-only workspace data for the dashboard (ADR-0035). Every route is a GET behind TenantGuard:
 * membership is the read permission (all roles, including READ_ONLY); other workspaces get 404.
 */
@Controller('workspaces/:workspaceId')
@UseGuards(TenantGuard)
export class DashboardController {
  constructor(
    private readonly insights: InsightsQueries,
    private readonly prospects: ProspectsQueries,
    private readonly outreach: OutreachQueries,
    private readonly account: AccountQueries,
  ) {}

  @Get('overview')
  overview(
    @CurrentAccess() access: WorkspaceAccess,
    @CurrentSession() session: ActiveSession,
    @Query(new ZodValidationPipe(OverviewQuerySchema)) query: z.infer<typeof OverviewQuerySchema>,
  ): Promise<Overview> {
    return this.insights.overview(access, query, {
      emailVerified: session.user.emailVerifiedAt !== null,
    });
  }

  /** Projects (business profiles) and their campaigns for the sidebar (ADR-0036). */
  @Get('projects')
  projects(@CurrentAccess() access: WorkspaceAccess): Promise<Projects> {
    return this.outreach.projects(access);
  }

  @Get('sent')
  sent(
    @CurrentAccess() access: WorkspaceAccess,
    @Query(new ZodValidationPipe(SentQuerySchema)) query: z.infer<typeof SentQuerySchema>,
  ): Promise<PageResult<SentItem>> {
    return this.outreach.sent(access, query);
  }

  @Get('sequences')
  sequences(
    @CurrentAccess() access: WorkspaceAccess,
    @Query(new ZodValidationPipe(ProjectFilterSchema)) query: z.infer<typeof ProjectFilterSchema>,
  ): Promise<Sequences> {
    return this.outreach.sequences(access, query);
  }

  @Get('analytics')
  analytics(
    @CurrentAccess() access: WorkspaceAccess,
    @Query(new ZodValidationPipe(RangeQuerySchema)) query: z.infer<typeof RangeQuerySchema>,
  ): Promise<Analytics> {
    return this.insights.analytics(access, query.range);
  }

  @Get('leads')
  leads(
    @CurrentAccess() access: WorkspaceAccess,
    @Query(new ZodValidationPipe(LeadQuerySchema)) query: z.infer<typeof LeadQuerySchema>,
  ): Promise<PageResult<LeadItem>> {
    return this.prospects.leads(access, query);
  }

  @Get('companies')
  companies(
    @CurrentAccess() access: WorkspaceAccess,
    @Query(new ZodValidationPipe(ListQuerySchema)) query: z.infer<typeof ListQuerySchema>,
  ): Promise<PageResult<CompanyItem>> {
    return this.prospects.companies(access, query);
  }

  @Get('companies/:companyId')
  company(
    @CurrentAccess() access: WorkspaceAccess,
    @Param('companyId', UuidParamPipe) id: string,
  ): Promise<CompanyDetail> {
    return this.prospects.company(access, id);
  }

  @Get('contacts')
  contacts(
    @CurrentAccess() access: WorkspaceAccess,
    @Query(new ZodValidationPipe(ContactQuerySchema)) query: z.infer<typeof ContactQuerySchema>,
  ): Promise<PageResult<ContactItem>> {
    return this.prospects.contacts(access, query);
  }

  @Get('contacts/:contactId')
  contact(
    @CurrentAccess() access: WorkspaceAccess,
    @Param('contactId', UuidParamPipe) id: string,
  ): Promise<ContactDetail> {
    return this.prospects.contact(access, id);
  }

  @Get('lead-lists')
  leadLists(@CurrentAccess() access: WorkspaceAccess) {
    return this.prospects.leadLists(access);
  }

  @Get('lead-lists/:listId')
  leadList(
    @CurrentAccess() access: WorkspaceAccess,
    @Param('listId', UuidParamPipe) id: string,
  ): Promise<LeadListDetail> {
    return this.prospects.leadList(access, id);
  }

  @Get('icps')
  icps(@CurrentAccess() access: WorkspaceAccess): Promise<IcpOverview> {
    return this.prospects.icps(access);
  }

  @Get('campaigns')
  campaigns(
    @CurrentAccess() access: WorkspaceAccess,
    @Query(new ZodValidationPipe(CampaignQuerySchema)) query: z.infer<typeof CampaignQuerySchema>,
  ): Promise<PageResult<CampaignItem>> {
    return this.outreach.campaigns(access, query);
  }

  @Get('campaigns/:campaignId')
  campaign(
    @CurrentAccess() access: WorkspaceAccess,
    @Param('campaignId', UuidParamPipe) id: string,
  ): Promise<CampaignDetail> {
    return this.outreach.campaign(access, id);
  }

  @Get('conversations')
  conversations(
    @CurrentAccess() access: WorkspaceAccess,
    @Query(new ZodValidationPipe(ConversationQuerySchema))
    query: z.infer<typeof ConversationQuerySchema>,
  ): Promise<PageResult<ConversationItem>> {
    return this.outreach.conversations(access, query);
  }

  @Get('conversations/:conversationId')
  conversation(
    @CurrentAccess() access: WorkspaceAccess,
    @Param('conversationId', UuidParamPipe) id: string,
  ): Promise<ConversationDetail> {
    return this.outreach.conversation(access, id);
  }

  @Get('meetings')
  meetings(
    @CurrentAccess() access: WorkspaceAccess,
    @Query(new ZodValidationPipe(MeetingQuerySchema)) query: z.infer<typeof MeetingQuerySchema>,
  ): Promise<{ data: MeetingItem[]; nextCursor: null }> {
    return this.outreach.meetings(access, query.when);
  }

  @Get('integrations')
  integrations(@CurrentAccess() access: WorkspaceAccess): Promise<Integrations> {
    return this.account.integrations(access);
  }

  @Get('billing')
  billing(@CurrentAccess() access: WorkspaceAccess): Promise<Billing> {
    return this.account.billing(access);
  }
}
