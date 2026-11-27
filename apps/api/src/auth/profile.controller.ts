import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Res } from '@nestjs/common';
import {
  type AcceptedResponse,
  type AuthIdentitySummary,
  type ChangeEmailRequest,
  ChangeEmailRequestSchema,
  type ChangePasswordRequest,
  ChangePasswordRequestSchema,
  type TokenRequest,
  TokenRequestSchema,
  type UpdateProfileRequest,
  UpdateProfileRequestSchema,
} from '@lga/contracts';
import {
  type ActiveSession,
  OAuthService,
  ProfileService,
  type RequestMeta,
  ZodValidationPipe,
} from '@lga/core';
import type { Response } from 'express';
import { clearSessionCookie } from './cookies.js';
import {
  CurrentSession,
  Meta,
  Public,
  RequireRecentAuth,
  SelfService,
  UuidParamPipe,
} from './request-context.js';

/** Profile settings (PRD AUTH-06, 08-authentication §4.5) and connected sign-in methods. */
@Controller('auth')
export class ProfileController {
  constructor(
    private readonly profile: ProfileService,
    private readonly oauth: OAuthService,
  ) {}

  @Patch('me')
  @SelfService()
  @HttpCode(204)
  async updateProfile(
    @Body(new ZodValidationPipe(UpdateProfileRequestSchema)) body: UpdateProfileRequest,
    @CurrentSession() session: ActiveSession,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.profile.updateProfile(session, body, meta);
  }

  @Post('password/change')
  @SelfService()
  @HttpCode(204)
  async changePassword(
    @Body(new ZodValidationPipe(ChangePasswordRequestSchema)) body: ChangePasswordRequest,
    @CurrentSession() session: ActiveSession,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.profile.changePassword(session, body, meta);
  }

  @Post('email/change')
  @SelfService()
  @RequireRecentAuth()
  @HttpCode(202)
  async changeEmail(
    @Body(new ZodValidationPipe(ChangeEmailRequestSchema)) body: ChangeEmailRequest,
    @CurrentSession() session: ActiveSession,
    @Meta() meta: RequestMeta,
  ): Promise<AcceptedResponse> {
    return {
      status: 'accepted',
      message: await this.profile.requestEmailChange(session, body.newEmail, meta),
    };
  }

  @Public()
  @Post('email/confirm')
  @HttpCode(204)
  async confirmEmail(
    @Body(new ZodValidationPipe(TokenRequestSchema)) body: TokenRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.profile.confirmEmailChange(body.token, meta);
  }

  @Public()
  @Post('email/revert')
  @HttpCode(204)
  async revertEmail(
    @Body(new ZodValidationPipe(TokenRequestSchema)) body: TokenRequest,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.profile.revertEmailChange(body.token, meta);
    // Every session was revoked, including this browser's.
    clearSessionCookie(res);
  }

  @Get('identities')
  async identities(
    @CurrentSession() session: ActiveSession,
  ): Promise<{ data: AuthIdentitySummary[] }> {
    return { data: await this.oauth.identities(session.userId) };
  }

  @Delete('identities/:identityId')
  @SelfService()
  @RequireRecentAuth()
  @HttpCode(204)
  async unlink(
    @Param('identityId', UuidParamPipe) identityId: string,
    @CurrentSession() session: ActiveSession,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.oauth.unlink(session, identityId, meta);
  }
}
