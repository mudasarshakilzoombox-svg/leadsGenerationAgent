import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DomainError, SessionService } from '@lga/core';
import { readSessionToken } from './cookies.js';
import {
  type AuthedRequest,
  IS_PUBLIC,
  REQUIRE_RECENT_AUTH,
  REQUIRE_VERIFIED_EMAIL,
} from './request-context.js';

/**
 * Global guard, default deny: every route needs a valid session unless marked `@Public()`.
 * Also enforces `@RequireVerifiedEmail()` and `@RequireRecentAuth()`.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets) ?? false;
    const req = context.switchToHttp().getRequest<AuthedRequest>();

    const token = readSessionToken(req);
    const session = token ? await this.sessions.resolve(token) : null;
    if (session) req.auth = session;
    if (isPublic) return true;
    if (!session) throw new DomainError('UNAUTHENTICATED', 'Sign in to continue.');

    if (
      this.reflector.getAllAndOverride<boolean>(REQUIRE_VERIFIED_EMAIL, targets) &&
      !session.user.emailVerifiedAt
    ) {
      throw new DomainError('EMAIL_NOT_VERIFIED', 'Verify your email address to do this.');
    }
    const recentSeconds = this.reflector.getAllAndOverride<number>(REQUIRE_RECENT_AUTH, targets);
    if (recentSeconds !== undefined) {
      const at = session.reauthenticatedAt?.getTime() ?? 0;
      if (Date.now() - at > recentSeconds * 1000) {
        throw new DomainError('REAUTH_REQUIRED', 'Confirm your password to continue.');
      }
    }
    return true;
  }
}
