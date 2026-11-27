import { Inject, Injectable } from '@nestjs/common';
import type { LoginRequest, PasswordResetRequest, SignupRequest } from '@lga/contracts';
import { APP_CONFIG } from '../../../config/config.module.js';
import type { ApiEnv } from '../../../config/env.js';
import { PrismaService } from '../../../database/prisma.service.js';
import { DomainError } from '../../../errors/domain-error.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { RateLimiter, type RateLimitRule } from '../../../platform/rate-limit/rate-limiter.js';
import { AuditService, type RequestMeta } from '../../audit/audit.service.js';
import { NotificationDispatcher } from '../../notifications/notification-dispatcher.js';
import {
  deviceKey,
  emailKey,
  hashToken,
  LOGIN_THROTTLE,
  loginDelaySeconds,
  normalizeEmail,
} from '../domain/identity.js';
import {
  BREACHED_PASSWORD_CHECKER,
  type BreachedPasswordChecker,
} from '../infrastructure/breached-passwords.js';
import { HUMAN_VERIFIER, type HumanVerifier } from '../infrastructure/human-verifier.js';
import { PasswordHasher } from '../infrastructure/password-hasher.js';
import { type ActiveSession, SessionService } from './session.service.js';

/** Rate-limit rules (03-api.md §8, PRD AUTH-01/02/05, 08-authentication.md §5). */
export const AUTH_LIMITS = {
  ipPerMinute: { scope: 'auth:ip', limit: 10, windowSeconds: 60 },
  signupPerIp: { scope: 'auth:signup:ip', limit: 5, windowSeconds: 60 * 60 },
  verifyResendPerAccount: { scope: 'auth:verify:acct', limit: 3, windowSeconds: 60 * 60 },
  resetPerAccount: { scope: 'auth:reset:acct', limit: 3, windowSeconds: 60 * 60 },
  signupNoticePerAccount: { scope: 'auth:signup-notice:acct', limit: 3, windowSeconds: 60 * 60 },
  loginFailAccount: {
    scope: 'auth:fail:acct',
    limit: Number.MAX_SAFE_INTEGER,
    windowSeconds: LOGIN_THROTTLE.windowSeconds,
  },
  loginFailAccountDay: {
    scope: 'auth:fail:acct24',
    limit: Number.MAX_SAFE_INTEGER,
    windowSeconds: LOGIN_THROTTLE.lockWindowSeconds,
  },
  loginFailIp: {
    scope: 'auth:fail:ip',
    limit: Number.MAX_SAFE_INTEGER,
    windowSeconds: LOGIN_THROTTLE.windowSeconds,
  },
} as const satisfies Record<string, RateLimitRule>;
const LOGIN_DELAY_SCOPE = 'auth:delay:acct';

const INVALID_CREDENTIALS = 'Email or password is incorrect.';
const CHECK_EMAIL = 'Check your email to continue.';

function fieldError(pointer: string, code: string, message: string): DomainError {
  return new DomainError('VALIDATION_FAILED', message, { errors: [{ pointer, code, message }] });
}

export interface LoginResult {
  token: string;
  session: ActiveSession;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly hasher: PasswordHasher,
    private readonly limiter: RateLimiter,
    private readonly audit: AuditService,
    private readonly notify: NotificationDispatcher,
    @Inject(BREACHED_PASSWORD_CHECKER) private readonly breached: BreachedPasswordChecker,
    @Inject(HUMAN_VERIFIER) private readonly human: HumanVerifier,
    @Inject(APP_CONFIG) private readonly env: ApiEnv,
  ) {}

  private accountKey(normalizedEmail: string): string {
    return emailKey(normalizedEmail, this.env.EMAIL_HASH_PEPPER);
  }

  private ipKey(meta: RequestMeta): string {
    return meta.ip ?? 'unknown';
  }

  /** 10 auth requests per minute per IP, on every public auth endpoint. */
  async throttleIp(meta: RequestMeta): Promise<void> {
    await this.limiter.consume(AUTH_LIMITS.ipPerMinute, this.ipKey(meta));
  }

  private async assertPasswordNotBreached(password: string, pointer: string): Promise<void> {
    if (await this.breached.isBreached(password)) {
      throw fieldError(
        pointer,
        'password_breached',
        'This password appeared in a data breach. Choose a different one.',
      );
    }
  }

  // ------------------------------------------------------------------------ signup (AUTH-01)

  /** Always resolves the same way for new and existing emails (no enumeration). */
  async signup(input: SignupRequest, meta: RequestMeta): Promise<void> {
    await this.throttleIp(meta);
    await this.limiter.consume(
      AUTH_LIMITS.signupPerIp,
      this.ipKey(meta),
      'Too many sign-up attempts from this network. Try again later.',
    );
    if (!(await this.human.verify(input.turnstileToken, meta.ip))) {
      throw fieldError(
        '/turnstileToken',
        'captcha_failed',
        'Complete the security check and try again.',
      );
    }
    await this.assertPasswordNotBreached(input.password, '/password');

    const emailNormalized = normalizeEmail(input.email);
    // Hash before looking up, so new and existing emails take the same time.
    const passwordHash = await this.hasher.hash(input.password);
    const existing = await this.prisma.user.findFirst({
      where: { emailNormalized, deletedAt: null },
      select: { id: true },
    });
    if (existing) {
      await this.noticeExistingSignup(existing.id, emailNormalized, meta);
      return;
    }

    let userId: string;
    try {
      const user = await this.prisma.user.create({
        data: {
          email: input.email.trim(),
          emailNormalized,
          name: input.name,
          passwordHash,
          termsVersionAccepted: input.termsVersion,
          termsAcceptedAt: new Date(),
        },
        select: { id: true },
      });
      userId = user.id;
    } catch (error) {
      // Concurrent signup with the same email: treat exactly like an existing account.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.prisma.user.findFirst({
          where: { emailNormalized, deletedAt: null },
          select: { id: true },
        });
        if (raced) await this.noticeExistingSignup(raced.id, emailNormalized, meta);
        return;
      }
      throw error;
    }
    await this.audit.record(
      { action: 'auth.signed_up', actorUserId: userId, targetType: 'user', targetId: userId },
      meta,
    );
    await this.notify.email(
      'auth.verify_email',
      { type: 'user', id: userId },
      { requestId: meta.requestId, actorUserId: userId },
    );
  }

  private async noticeExistingSignup(
    userId: string,
    emailNormalized: string,
    meta: RequestMeta,
  ): Promise<void> {
    const sent = await this.limiter.hit(
      AUTH_LIMITS.signupNoticePerAccount,
      this.accountKey(emailNormalized),
    );
    if (sent.allowed) {
      await this.notify.email(
        'auth.signup_existing',
        { type: 'user', id: userId },
        { requestId: meta.requestId },
      );
    }
  }

  // -------------------------------------------------------------- verification (AUTH-02)

  /** Consumes a verification link and signs the user in. */
  async verifyEmail(token: string, meta: RequestMeta): Promise<LoginResult> {
    await this.throttleIp(meta);
    const row = await this.prisma.verificationToken.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        id: true,
        userId: true,
        purpose: true,
        usedAt: true,
        expiresAt: true,
        user: { select: { deletedAt: true } },
      },
    });
    if (
      !row ||
      row.purpose !== 'EMAIL_VERIFY' ||
      row.usedAt ||
      row.expiresAt <= new Date() ||
      row.user.deletedAt
    ) {
      throw fieldError(
        '/token',
        'token_invalid',
        'This link is invalid or has expired. Request a new one.',
      );
    }
    const now = new Date();
    const consumed = await this.prisma.$transaction(async (tx) => {
      const used = await tx.verificationToken.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: now },
      });
      if (used.count !== 1) return false;
      await tx.user.updateMany({
        where: { id: row.userId, emailVerifiedAt: null },
        data: { emailVerifiedAt: now },
      });
      return true;
    });
    if (!consumed) {
      throw fieldError(
        '/token',
        'token_invalid',
        'This link is invalid or has expired. Request a new one.',
      );
    }
    await this.sessions.invalidateUser(row.userId);
    await this.audit.record(
      {
        action: 'auth.email_verified',
        actorUserId: row.userId,
        targetType: 'user',
        targetId: row.userId,
      },
      meta,
    );
    return this.sessions.create(row.userId, meta);
  }

  /** Same response whether or not the account exists or is verified. */
  async resendVerification(email: string, meta: RequestMeta): Promise<void> {
    await this.throttleIp(meta);
    const emailNormalized = normalizeEmail(email);
    const quota = await this.limiter.hit(
      AUTH_LIMITS.verifyResendPerAccount,
      this.accountKey(emailNormalized),
    );
    if (!quota.allowed) return;
    const user = await this.prisma.user.findFirst({
      where: { emailNormalized, deletedAt: null, emailVerifiedAt: null },
      select: { id: true },
    });
    if (user)
      await this.notify.email(
        'auth.verify_email',
        { type: 'user', id: user.id },
        { requestId: meta.requestId },
      );
  }

  // --------------------------------------------------------------------- login (AUTH-04)

  async login(input: LoginRequest, meta: RequestMeta, currentToken?: string): Promise<LoginResult> {
    await this.throttleIp(meta);
    const emailNormalized = normalizeEmail(input.email);
    const account = this.accountKey(emailNormalized);
    const ip = this.ipKey(meta);

    const waitSeconds = await this.limiter.blockedFor(LOGIN_DELAY_SCOPE, account);
    if (waitSeconds > 0) {
      throw new DomainError(
        'RATE_LIMITED',
        `Too many failed attempts. Try again in ${waitSeconds} seconds.`,
        {
          extensions: { retryAfterSeconds: waitSeconds },
        },
      );
    }

    const [accountFailures, ipFailures] = await Promise.all([
      this.limiter.count(AUTH_LIMITS.loginFailAccount.scope, account),
      this.limiter.count(AUTH_LIMITS.loginFailIp.scope, ip),
    ]);
    if (
      accountFailures >= LOGIN_THROTTLE.captchaAfterAccount ||
      ipFailures >= LOGIN_THROTTLE.captchaAfterIp
    ) {
      if (!input.turnstileToken) {
        throw fieldError(
          '/turnstileToken',
          'captcha_required',
          'Complete the security check to continue.',
        );
      }
      if (!(await this.human.verify(input.turnstileToken, meta.ip))) {
        throw fieldError(
          '/turnstileToken',
          'captcha_failed',
          'Complete the security check and try again.',
        );
      }
    }

    const user = await this.prisma.user.findFirst({
      where: { emailNormalized, deletedAt: null },
      select: { id: true, passwordHash: true, lockedUntil: true },
    });
    const passwordOk = await this.hasher.verify(user?.passwordHash, input.password);
    const locked = Boolean(user?.lockedUntil && user.lockedUntil > new Date());

    if (!user || !passwordOk || locked) {
      await this.recordLoginFailure(account, ip, user?.id, meta, locked);
      throw new DomainError('UNAUTHENTICATED', INVALID_CREDENTIALS);
    }

    await Promise.all([
      this.limiter.reset(AUTH_LIMITS.loginFailAccount.scope, account),
      this.limiter.reset(LOGIN_DELAY_SCOPE, account),
    ]);
    const isNewDevice = await this.isNewDevice(user.id, meta);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
        ...(user.passwordHash && this.hasher.needsRehash(user.passwordHash)
          ? { passwordHash: await this.hasher.hash(input.password) }
          : {}),
      },
    });

    // Session fixation defense: a session presented at login is replaced, never upgraded.
    if (currentToken) {
      const previous = await this.sessions.resolve(currentToken);
      if (previous) await this.sessions.revoke(previous.id, previous.userId);
    }
    const result = await this.sessions.create(user.id, meta);
    await this.audit.record(
      {
        action: 'auth.login_succeeded',
        actorUserId: user.id,
        targetType: 'session',
        targetId: result.session.id,
      },
      meta,
    );
    if (isNewDevice) {
      await this.notify.email(
        'auth.new_device',
        { type: 'user', id: user.id },
        { requestId: meta.requestId },
      );
    }
    return result;
  }

  private async recordLoginFailure(
    account: string,
    ip: string,
    userId: string | undefined,
    meta: RequestMeta,
    alreadyLocked: boolean,
  ): Promise<void> {
    const [window, day] = await Promise.all([
      this.limiter.hit(AUTH_LIMITS.loginFailAccount, account),
      this.limiter.hit(AUTH_LIMITS.loginFailAccountDay, account),
      this.limiter.hit(AUTH_LIMITS.loginFailIp, ip),
    ]);
    const delay = loginDelaySeconds(window.count);
    if (delay > 0) await this.limiter.block(LOGIN_DELAY_SCOPE, account, delay);
    if (!userId) return;

    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 } },
    });
    await this.audit.record(
      { action: 'auth.login_failed', actorUserId: userId, targetType: 'user', targetId: userId },
      meta,
    );
    if (!alreadyLocked && day.count >= LOGIN_THROTTLE.lockAfter) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { lockedUntil: new Date(Date.now() + LOGIN_THROTTLE.lockSeconds * 1000) },
      });
      await this.audit.record(
        {
          action: 'auth.account_locked',
          actorUserId: userId,
          actorType: 'SYSTEM',
          targetType: 'user',
          targetId: userId,
        },
        meta,
      );
      await this.notify.email(
        'auth.account_locked',
        { type: 'user', id: userId },
        { requestId: meta.requestId },
      );
    }
  }

  private async isNewDevice(userId: string, meta: RequestMeta): Promise<boolean> {
    const recent = await this.sessions.recentDevices(userId);
    // The very first sign-in is not "new": there is nothing to compare against.
    if (recent.length === 0) return false;
    const key = deviceKey(meta.userAgent, meta.ip);
    return !recent.some((s) => deviceKey(s.userAgent ?? undefined, s.ip ?? undefined) === key);
  }

  async logout(session: ActiveSession, meta: RequestMeta): Promise<void> {
    await this.sessions.revoke(session.id, session.userId);
    await this.audit.record(
      {
        action: 'auth.logout',
        actorUserId: session.userId,
        targetType: 'session',
        targetId: session.id,
      },
      meta,
    );
  }

  // ------------------------------------------------------------ password reset (AUTH-05)

  async forgotPassword(email: string, meta: RequestMeta): Promise<void> {
    await this.throttleIp(meta);
    const emailNormalized = normalizeEmail(email);
    const quota = await this.limiter.hit(
      AUTH_LIMITS.resetPerAccount,
      this.accountKey(emailNormalized),
    );
    if (!quota.allowed) return;
    const user = await this.prisma.user.findFirst({
      where: { emailNormalized, deletedAt: null },
      select: { id: true },
    });
    if (user)
      await this.notify.email(
        'auth.password_reset',
        { type: 'user', id: user.id },
        { requestId: meta.requestId },
      );
  }

  async resetPassword(input: PasswordResetRequest, meta: RequestMeta): Promise<void> {
    await this.throttleIp(meta);
    const row = await this.prisma.passwordReset.findUnique({
      where: { tokenHash: hashToken(input.token) },
      select: {
        id: true,
        userId: true,
        usedAt: true,
        expiresAt: true,
        user: { select: { deletedAt: true, emailNormalized: true } },
      },
    });
    if (!row || row.usedAt || row.expiresAt <= new Date() || row.user.deletedAt) {
      throw fieldError(
        '/token',
        'token_invalid',
        'This reset link is invalid or has expired. Request a new one.',
      );
    }
    await this.assertPasswordNotBreached(input.newPassword, '/newPassword');
    const passwordHash = await this.hasher.hash(input.newPassword);
    const now = new Date();
    const consumed = await this.prisma.$transaction(async (tx) => {
      const used = await tx.passwordReset.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: now },
      });
      if (used.count !== 1) return false;
      await tx.passwordReset.updateMany({
        where: { userId: row.userId, usedAt: null },
        data: { usedAt: now },
      });
      await tx.user.update({
        where: { id: row.userId },
        // The link proved control of the mailbox, so the address counts as verified.
        data: { passwordHash, lockedUntil: null, failedLoginCount: 0 },
      });
      await tx.user.updateMany({
        where: { id: row.userId, emailVerifiedAt: null },
        data: { emailVerifiedAt: now },
      });
      return true;
    });
    if (!consumed) {
      throw fieldError(
        '/token',
        'token_invalid',
        'This reset link is invalid or has expired. Request a new one.',
      );
    }
    await this.sessions.revokeAll(row.userId);
    const account = this.accountKey(row.user.emailNormalized);
    await Promise.all([
      this.limiter.reset(AUTH_LIMITS.loginFailAccount.scope, account),
      this.limiter.reset(AUTH_LIMITS.loginFailAccountDay.scope, account),
      this.limiter.reset(LOGIN_DELAY_SCOPE, account),
    ]);
    await this.audit.record(
      {
        action: 'auth.password_reset',
        actorUserId: row.userId,
        targetType: 'user',
        targetId: row.userId,
      },
      meta,
    );
    await this.notify.email(
      'auth.password_changed',
      { type: 'user', id: row.userId },
      { requestId: meta.requestId },
    );
  }

  // ------------------------------------------------------------------ step-up (08 §7)

  async reauthenticate(session: ActiveSession, password: string, meta: RequestMeta): Promise<void> {
    const account = this.accountKey(session.user.emailNormalized);
    const waitSeconds = await this.limiter.blockedFor(LOGIN_DELAY_SCOPE, account);
    if (waitSeconds > 0) {
      throw new DomainError(
        'RATE_LIMITED',
        `Too many failed attempts. Try again in ${waitSeconds} seconds.`,
        {
          extensions: { retryAfterSeconds: waitSeconds },
        },
      );
    }
    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
      select: { passwordHash: true },
    });
    if (!(await this.hasher.verify(user?.passwordHash, password))) {
      await this.recordLoginFailure(account, this.ipKey(meta), session.userId, meta, false);
      throw new DomainError('UNAUTHENTICATED', 'The password is incorrect.');
    }
    await this.sessions.markReauthenticated(session.id);
  }

  // ---------------------------------------------------------------------- sessions

  async revokeSession(session: ActiveSession, sessionId: string, meta: RequestMeta): Promise<void> {
    if (!(await this.sessions.revoke(sessionId, session.userId))) {
      throw new DomainError('NOT_FOUND', 'Session not found.');
    }
    await this.audit.record(
      {
        action: 'session.revoked',
        actorUserId: session.userId,
        targetType: 'session',
        targetId: sessionId,
      },
      meta,
    );
  }

  async revokeOtherSessions(session: ActiveSession, meta: RequestMeta): Promise<number> {
    const count = await this.sessions.revokeAll(session.userId, session.id);
    await this.audit.record(
      {
        action: 'sessions.revoked_others',
        actorUserId: session.userId,
        targetType: 'user',
        targetId: session.userId,
        metadata: { count },
      },
      meta,
    );
    return count;
  }

  static readonly CHECK_EMAIL = CHECK_EMAIL;
}
