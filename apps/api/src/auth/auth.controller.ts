import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import {
  type AcceptedResponse,
  type EmailOnlyRequest,
  EmailOnlyRequestSchema,
  type LoginRequest,
  LoginRequestSchema,
  type MeResponse,
  type PasswordResetRequest,
  PasswordResetRequestSchema,
  type ReauthenticateRequest,
  ReauthenticateRequestSchema,
  type SessionSummary,
  type SignupRequest,
  SignupRequestSchema,
  type TokenRequest,
  TokenRequestSchema,
  type UserSummary,
} from '@lga/contracts';
import {
  type ActiveSession,
  AuthService,
  type RequestMeta,
  SessionService,
  type SessionUser,
  WorkspaceService,
  ZodValidationPipe,
} from '@lga/core';
import type { Response } from 'express';
import { clearSessionCookie, readSessionToken, setSessionCookie } from './cookies.js';
import {
  type AuthedRequest,
  CurrentSession,
  Meta,
  Public,
  UuidParamPipe,
} from './request-context.js';

const CHECK_EMAIL: AcceptedResponse = {
  status: 'accepted',
  message: 'If the details are valid, we have sent you an email. Check your inbox to continue.',
};

export function toUserSummary(user: SessionUser): UserSummary {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerifiedAt !== null,
    locale: user.locale,
    timezone: user.timezone,
  };
}

/** PRD AUTH-01, 02, 04, 05 (docs/architecture/08-authentication.md). */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly workspaces: WorkspaceService,
  ) {}

  @Public()
  @Post('signup')
  @HttpCode(202)
  async signup(
    @Body(new ZodValidationPipe(SignupRequestSchema)) body: SignupRequest,
    @Meta() meta: RequestMeta,
  ): Promise<AcceptedResponse> {
    await this.auth.signup(body, meta);
    return CHECK_EMAIL;
  }

  @Public()
  @Post('verify-email')
  @HttpCode(200)
  async verifyEmail(
    @Body(new ZodValidationPipe(TokenRequestSchema)) body: TokenRequest,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: UserSummary }> {
    const { token, session } = await this.auth.verifyEmail(body.token, meta);
    setSessionCookie(res, token);
    return { user: toUserSummary(session.user) };
  }

  @Public()
  @Post('verify-email/resend')
  @HttpCode(202)
  async resendVerification(
    @Body(new ZodValidationPipe(EmailOnlyRequestSchema)) body: EmailOnlyRequest,
    @Meta() meta: RequestMeta,
  ): Promise<AcceptedResponse> {
    await this.auth.resendVerification(body.email, meta);
    return CHECK_EMAIL;
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(LoginRequestSchema)) body: LoginRequest,
    @Meta() meta: RequestMeta,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: UserSummary }> {
    const { token, session } = await this.auth.login(body, meta, readSessionToken(req));
    setSessionCookie(res, token);
    return { user: toUserSummary(session.user) };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @CurrentSession() session: ActiveSession,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(session, meta);
    clearSessionCookie(res);
  }

  @Public()
  @Post('password/forgot')
  @HttpCode(202)
  async forgotPassword(
    @Body(new ZodValidationPipe(EmailOnlyRequestSchema)) body: EmailOnlyRequest,
    @Meta() meta: RequestMeta,
  ): Promise<AcceptedResponse> {
    await this.auth.forgotPassword(body.email, meta);
    return CHECK_EMAIL;
  }

  @Public()
  @Post('password/reset')
  @HttpCode(204)
  async resetPassword(
    @Body(new ZodValidationPipe(PasswordResetRequestSchema)) body: PasswordResetRequest,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.resetPassword(body, meta);
    // Every session was revoked, including this browser's.
    clearSessionCookie(res);
  }

  @Post('reauthenticate')
  @HttpCode(204)
  async reauthenticate(
    @Body(new ZodValidationPipe(ReauthenticateRequestSchema)) body: ReauthenticateRequest,
    @CurrentSession() session: ActiveSession,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.auth.reauthenticate(session, body.password, meta);
  }

  @Get('me')
  async me(@CurrentSession() session: ActiveSession): Promise<MeResponse> {
    return {
      user: toUserSummary(session.user),
      memberships: await this.workspaces.membershipsFor(session.userId),
    };
  }

  @Get('sessions')
  async listSessions(
    @CurrentSession() session: ActiveSession,
  ): Promise<{ data: SessionSummary[]; nextCursor: null }> {
    const rows = await this.sessions.list(session.userId);
    return {
      data: rows.map((s) => ({
        id: s.id,
        current: s.id === session.id,
        userAgent: s.userAgent,
        ip: s.ip,
        createdAt: s.createdAt.toISOString(),
        lastSeenAt: s.lastSeenAt.toISOString(),
      })),
      nextCursor: null,
    };
  }

  @Delete('sessions/:sessionId')
  @HttpCode(204)
  async revokeSession(
    @Param('sessionId', UuidParamPipe) sessionId: string,
    @CurrentSession() session: ActiveSession,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.revokeSession(session, sessionId, meta);
    if (sessionId === session.id) clearSessionCookie(res);
  }

  @Post('sessions/revoke-others')
  @HttpCode(204)
  async revokeOthers(
    @CurrentSession() session: ActiveSession,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.auth.revokeOtherSessions(session, meta);
  }
}
