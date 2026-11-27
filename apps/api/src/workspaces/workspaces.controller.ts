import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  type ChangeMemberRoleRequest,
  ChangeMemberRoleRequestSchema,
  type CreateInvitationRequest,
  CreateInvitationRequestSchema,
  type CreateWorkspaceRequest,
  CreateWorkspaceRequestSchema,
  EmailTokenSchema,
  type InvitationLookup,
  type InvitationSummary,
  type MemberSummary,
  type MembershipSummary,
  type TokenRequest,
  TokenRequestSchema,
  type TransferOwnershipRequest,
  TransferOwnershipRequestSchema,
  type DeleteWorkspaceRequest,
  DeleteWorkspaceRequestSchema,
  type UpdateWorkspaceRequest,
  UpdateWorkspaceRequestSchema,
  type WorkspaceDetail,
  type WorkspaceSummary,
} from '@lga/contracts';
import {
  type ActiveSession,
  DomainError,
  formatEtag,
  InvitationsService,
  MembersService,
  parseIfMatch,
  type RequestMeta,
  type WorkspaceAccess,
  WorkspaceLifecycleService,
  WorkspaceService,
  WorkspaceSettingsService,
  ZodValidationPipe,
} from '@lga/core';
import type { Response } from 'express';
import { API_PREFIX } from '../configure-app.js';
import {
  AllowRestrictedWorkspace,
  CurrentAccess,
  CurrentSession,
  Meta,
  Public,
  RequirePermission,
  RequireRecentAuth,
  RequireVerifiedEmail,
  SelfService,
  UuidParamPipe,
} from '../auth/request-context.js';
import { TenantGuard } from '../auth/tenant.guard.js';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor.js';

type List<T> = { data: T[]; nextCursor: null };

/**
 * PRD WS-01: workspaces the user belongs to and creating new ones. WS-06: settings with
 * optimistic locking (ETag / If-Match, 03-api §7). WS-07: delete with a 30-day restore window.
 */
@Controller('workspaces')
export class WorkspacesController {
  constructor(
    private readonly workspaces: WorkspaceService,
    private readonly settings: WorkspaceSettingsService,
    private readonly lifecycle: WorkspaceLifecycleService,
  ) {}

  @Post()
  async create(
    @Body(new ZodValidationPipe(CreateWorkspaceRequestSchema)) body: CreateWorkspaceRequest,
    @CurrentSession() session: ActiveSession,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<WorkspaceSummary> {
    const workspace = await this.workspaces.create(
      { id: session.userId, timezone: session.user.timezone },
      body,
      meta,
    );
    res.location(`/${API_PREFIX}/workspaces/${workspace.id}`);
    return workspace;
  }

  @Get()
  async list(@CurrentSession() session: ActiveSession): Promise<List<MembershipSummary>> {
    return { data: await this.workspaces.membershipsFor(session.userId), nextCursor: null };
  }

  @Get(':workspaceId')
  @UseGuards(TenantGuard)
  async get(
    @CurrentAccess() access: WorkspaceAccess,
    @Res({ passthrough: true }) res: Response,
  ): Promise<WorkspaceDetail> {
    return withEtag(res, await this.settings.get(access));
  }

  @Patch(':workspaceId')
  @UseGuards(TenantGuard)
  @RequirePermission('workspace.settings')
  async update(
    @Body(new ZodValidationPipe(UpdateWorkspaceRequestSchema)) body: UpdateWorkspaceRequest,
    @Headers('if-match') ifMatch: string | undefined,
    @CurrentAccess() access: WorkspaceAccess,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<WorkspaceDetail> {
    const expected = parseIfMatch(ifMatch);
    return withEtag(res, await this.settings.update(access, expected, body, meta));
  }

  /** WS-07 AC1: Owner only, typed name, recent password. Sending stops at once (SendPolicy SP-01). */
  @Delete(':workspaceId')
  @UseGuards(TenantGuard)
  @RequirePermission('workspace.delete')
  @RequireRecentAuth()
  @AllowRestrictedWorkspace()
  async remove(
    @Body(new ZodValidationPipe(DeleteWorkspaceRequestSchema)) body: DeleteWorkspaceRequest,
    @CurrentAccess() access: WorkspaceAccess,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<WorkspaceDetail> {
    return withEtag(res, await this.lifecycle.requestDeletion(access, body.confirmName, meta));
  }

  /** WS-07 AC2: the Owner can restore within the 30-day grace period. */
  @Post(':workspaceId/restore')
  @UseGuards(TenantGuard)
  @RequirePermission('workspace.delete')
  @AllowRestrictedWorkspace()
  @HttpCode(200)
  async restore(
    @CurrentAccess() access: WorkspaceAccess,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<WorkspaceDetail> {
    return withEtag(res, await this.lifecycle.restore(access, meta));
  }
}

function withEtag(res: Response, detail: WorkspaceDetail): WorkspaceDetail {
  res.setHeader('ETag', formatEtag(detail.rowVersion));
  res.setHeader('Cache-Control', 'no-store');
  return detail;
}

/** PRD WS-04/05: team management inside one workspace. */
@Controller('workspaces/:workspaceId')
@UseGuards(TenantGuard)
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get('members')
  async list(@CurrentAccess() access: WorkspaceAccess): Promise<List<MemberSummary>> {
    return { data: await this.members.list(access), nextCursor: null };
  }

  @Patch('members/:memberId')
  @RequirePermission('members.manage')
  async changeRole(
    @Param('memberId', UuidParamPipe) memberId: string,
    @Body(new ZodValidationPipe(ChangeMemberRoleRequestSchema)) body: ChangeMemberRoleRequest,
    @CurrentAccess() access: WorkspaceAccess,
    @Meta() meta: RequestMeta,
  ): Promise<MemberSummary> {
    return this.members.changeRole(access, memberId, body.roleKey, meta);
  }

  /** Removing someone needs `members.manage`; removing yourself (leaving) does not. */
  @Delete('members/:memberId')
  @SelfService()
  @HttpCode(204)
  async remove(
    @Param('memberId', UuidParamPipe) memberId: string,
    @CurrentAccess() access: WorkspaceAccess,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.members.remove(access, memberId, meta);
  }

  @Post('transfer-ownership')
  @RequirePermission('workspace.transfer_ownership')
  @RequireRecentAuth()
  @HttpCode(204)
  async transferOwnership(
    @Body(new ZodValidationPipe(TransferOwnershipRequestSchema)) body: TransferOwnershipRequest,
    @CurrentAccess() access: WorkspaceAccess,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.members.transferOwnership(access, body.memberId, meta);
  }
}

/** PRD WS-03: invitations. Only Owners and Admins, and only with a verified email. */
@Controller('workspaces/:workspaceId/invitations')
@UseGuards(TenantGuard)
@RequirePermission('members.manage')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get()
  async list(@CurrentAccess() access: WorkspaceAccess): Promise<List<InvitationSummary>> {
    return { data: await this.invitations.list(access), nextCursor: null };
  }

  @Post()
  @RequireVerifiedEmail()
  @UseInterceptors(IdempotencyInterceptor)
  async create(
    @Body(new ZodValidationPipe(CreateInvitationRequestSchema)) body: CreateInvitationRequest,
    @CurrentAccess() access: WorkspaceAccess,
    @Meta() meta: RequestMeta,
  ): Promise<InvitationSummary> {
    return this.invitations.create(access, body, meta);
  }

  @Post(':invitationId/resend')
  @RequireVerifiedEmail()
  @HttpCode(202)
  async resend(
    @Param('invitationId', UuidParamPipe) invitationId: string,
    @CurrentAccess() access: WorkspaceAccess,
    @Meta() meta: RequestMeta,
  ): Promise<InvitationSummary> {
    return this.invitations.resend(access, invitationId, meta);
  }

  @Delete(':invitationId')
  @HttpCode(204)
  async revoke(
    @Param('invitationId', UuidParamPipe) invitationId: string,
    @CurrentAccess() access: WorkspaceAccess,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.invitations.revoke(access, invitationId, meta);
  }
}

/** Token-based invitation endpoints: the token is the capability, not a path workspace id. */
@Controller('invitations')
export class InvitationAcceptController {
  constructor(private readonly invitations: InvitationsService) {}

  @Public()
  @Get('lookup')
  async lookup(
    @Query('token') token: unknown,
    @Meta() meta: RequestMeta,
  ): Promise<InvitationLookup> {
    const parsed = EmailTokenSchema.safeParse(token);
    if (!parsed.success)
      throw new DomainError('NOT_FOUND', 'This invitation is invalid or has expired.');
    return this.invitations.lookup(parsed.data, meta);
  }

  @Post('accept')
  @HttpCode(200)
  async accept(
    @Body(new ZodValidationPipe(TokenRequestSchema)) body: TokenRequest,
    @CurrentSession() session: ActiveSession,
    @Meta() meta: RequestMeta,
  ): Promise<MembershipSummary> {
    return this.invitations.accept(session, body.token, meta);
  }
}
