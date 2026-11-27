import { Injectable } from '@nestjs/common';
import type { ChangePasswordRequest, UpdateProfileRequest } from '@lga/contracts';
import { PrismaService } from '../../../database/prisma.service.js';
import { DomainError } from '../../../errors/domain-error.js';
import { RateLimiter } from '../../../platform/rate-limit/rate-limiter.js';
import { AuditService, type RequestMeta } from '../../audit/audit.service.js';
import { NotificationDispatcher } from '../../notifications/notification-dispatcher.js';
import { generateToken, hashToken, normalizeEmail } from '../domain/identity.js';
import { AUTH_TOKEN_TTL } from '../domain/token-ttl.js';
import { PasswordHasher } from '../infrastructure/password-hasher.js';
import { AuthService } from './auth.service.js';
import { type ActiveSession, SessionService } from './session.service.js';

/**
 * Profile settings (PRD AUTH-06, 08-authentication §4.5): name and time zone, password change
 * (current password required, other sessions signed out) and email change (verify the new
 * address, notify the old one with a 7-day "this wasn't me" revert link).
 */

const EMAIL_CHANGE_PER_HOUR = {
  scope: 'auth:email-change:user',
  limit: 3,
  windowSeconds: 3600,
} as const;
const CHANGE_REQUESTED =
  'If that address can be used, we sent a confirmation link to it. Your current address stays active until you confirm.';

function fieldError(pointer: string, code: string, message: string): DomainError {
  return new DomainError('VALIDATION_FAILED', message, { errors: [{ pointer, code, message }] });
}

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly hasher: PasswordHasher,
    private readonly limiter: RateLimiter,
    private readonly audit: AuditService,
    private readonly notify: NotificationDispatcher,
  ) {}

  async updateProfile(
    session: ActiveSession,
    input: UpdateProfileRequest,
    meta: RequestMeta,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: session.userId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      },
    });
    // The resolved session caches the user: refresh it so the new values show immediately.
    await this.sessions.invalidateUser(session.userId);
    await this.audit.record(
      {
        action: 'auth.profile_updated',
        actorUserId: session.userId,
        targetType: 'user',
        targetId: session.userId,
        metadata: { name: input.name !== undefined, timezone: input.timezone !== undefined },
      },
      meta,
    );
  }

  /** AUTH-06 AC1: current password required; other sessions are signed out. */
  async changePassword(
    session: ActiveSession,
    input: ChangePasswordRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
      select: { passwordHash: true, emailNormalized: true },
    });
    if (!user?.passwordHash) {
      throw fieldError(
        '/currentPassword',
        'no_password',
        'Your account does not have a password yet. Use "Forgot password" to set one.',
      );
    }
    try {
      await this.auth.verifyAccountPassword(
        session.userId,
        user.emailNormalized,
        input.currentPassword,
        meta,
      );
    } catch (error) {
      if (error instanceof DomainError && error.code === 'UNAUTHENTICATED') {
        throw fieldError(
          '/currentPassword',
          'password_incorrect',
          'The current password is incorrect.',
        );
      }
      throw error;
    }
    if (await this.hasher.verify(user.passwordHash, input.newPassword)) {
      throw fieldError(
        '/newPassword',
        'password_unchanged',
        'Choose a password different from the current one.',
      );
    }
    await this.auth.assertPasswordNotBreached(input.newPassword, '/newPassword');
    await this.prisma.user.update({
      where: { id: session.userId },
      data: { passwordHash: await this.hasher.hash(input.newPassword) },
    });
    await this.sessions.revokeAll(session.userId, session.id);
    await this.sessions.markReauthenticated(session.id);
    await this.audit.record(
      {
        action: 'auth.password_changed',
        actorUserId: session.userId,
        targetType: 'user',
        targetId: session.userId,
      },
      meta,
    );
    await this.notify.email(
      'auth.password_changed',
      { type: 'user', id: session.userId },
      { requestId: meta.requestId },
    );
  }

  /**
   * AUTH-06 AC2: send a confirmation link to the new address. The same answer whether or not the
   * address is taken, so this cannot be used to discover accounts.
   */
  async requestEmailChange(
    session: ActiveSession,
    newEmail: string,
    meta: RequestMeta,
  ): Promise<string> {
    const emailNormalized = normalizeEmail(newEmail);
    if (emailNormalized === session.user.emailNormalized) {
      throw fieldError('/newEmail', 'email_unchanged', 'This is already your email address.');
    }
    const allowed = await this.limiter.hit(EMAIL_CHANGE_PER_HOUR, session.userId);
    if (!allowed.allowed) {
      throw new DomainError('RATE_LIMITED', 'Too many email change requests. Try again later.', {
        extensions: { retryAfterSeconds: allowed.retryAfterSeconds },
      });
    }
    const taken = await this.prisma.user.findFirst({
      where: { emailNormalized, deletedAt: null },
      select: { id: true },
    });
    if (!taken) {
      const row = await this.prisma.$transaction(async (tx) => {
        // Only the latest request stays valid.
        await tx.verificationToken.updateMany({
          where: { userId: session.userId, purpose: 'EMAIL_CHANGE', usedAt: null },
          data: { usedAt: new Date() },
        });
        return tx.verificationToken.create({
          data: {
            userId: session.userId,
            purpose: 'EMAIL_CHANGE',
            tokenHash: hashToken(generateToken()), // placeholder: the worker mints the real token
            newEmail: newEmail.trim(),
            expiresAt: new Date(Date.now() + AUTH_TOKEN_TTL.emailChangeSeconds * 1000),
          },
          select: { id: true },
        });
      });
      await this.notify.email(
        'auth.email_change_verify',
        { type: 'verification_token', id: row.id },
        { requestId: meta.requestId },
      );
    }
    await this.audit.record(
      {
        action: 'auth.email_change_requested',
        actorUserId: session.userId,
        targetType: 'user',
        targetId: session.userId,
      },
      meta,
    );
    return CHANGE_REQUESTED;
  }

  /** The new address confirmed: switch, and notify the old address with a revert link. */
  async confirmEmailChange(token: string, meta: RequestMeta): Promise<void> {
    await this.auth.throttleIp(meta);
    const invalid = () =>
      fieldError(
        '/token',
        'token_invalid',
        'This link is invalid or has expired. Request the change again.',
      );
    const row = await this.prisma.verificationToken.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        id: true,
        userId: true,
        purpose: true,
        newEmail: true,
        usedAt: true,
        expiresAt: true,
        user: { select: { email: true, deletedAt: true } },
      },
    });
    if (
      !row ||
      row.purpose !== 'EMAIL_CHANGE' ||
      !row.newEmail ||
      row.usedAt ||
      row.expiresAt <= new Date() ||
      row.user.deletedAt
    ) {
      throw invalid();
    }
    const newEmail = row.newEmail;
    const emailNormalized = normalizeEmail(newEmail);
    const oldEmail = row.user.email;
    const revertId = await this.prisma.$transaction(async (tx) => {
      const used = await tx.verificationToken.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (used.count !== 1) return null;
      const taken = await tx.user.findFirst({
        where: { emailNormalized, deletedAt: null, id: { not: row.userId } },
        select: { id: true },
      });
      if (taken) return null;
      await tx.user.update({
        where: { id: row.userId },
        data: { email: newEmail, emailNormalized, emailVerifiedAt: new Date() },
      });
      const revert = await tx.verificationToken.create({
        data: {
          userId: row.userId,
          purpose: 'EMAIL_CHANGE_REVERT',
          tokenHash: hashToken(generateToken()), // placeholder: minted by the worker
          newEmail: oldEmail, // the address to restore (and to notify)
          expiresAt: new Date(Date.now() + AUTH_TOKEN_TTL.emailChangeRevertSeconds * 1000),
        },
        select: { id: true },
      });
      await this.audit.record(
        {
          action: 'auth.email_changed',
          actorUserId: row.userId,
          targetType: 'user',
          targetId: row.userId,
        },
        meta,
        tx,
      );
      return revert.id;
    });
    if (!revertId) throw invalid();
    await this.sessions.invalidateUser(row.userId);
    await this.notify.email(
      'auth.email_changed',
      { type: 'verification_token', id: revertId },
      { requestId: meta.requestId },
    );
  }

  /** "This wasn't me": restore the old address and sign out everywhere. */
  async revertEmailChange(token: string, meta: RequestMeta): Promise<void> {
    await this.auth.throttleIp(meta);
    const invalid = () =>
      fieldError('/token', 'token_invalid', 'This link is invalid or has expired.');
    const row = await this.prisma.verificationToken.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        id: true,
        userId: true,
        purpose: true,
        newEmail: true,
        usedAt: true,
        expiresAt: true,
        user: { select: { deletedAt: true } },
      },
    });
    if (
      !row ||
      row.purpose !== 'EMAIL_CHANGE_REVERT' ||
      !row.newEmail ||
      row.usedAt ||
      row.expiresAt <= new Date() ||
      row.user.deletedAt
    ) {
      throw invalid();
    }
    const oldEmail = row.newEmail;
    const emailNormalized = normalizeEmail(oldEmail);
    const done = await this.prisma.$transaction(async (tx) => {
      const used = await tx.verificationToken.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (used.count !== 1) return false;
      const taken = await tx.user.findFirst({
        where: { emailNormalized, deletedAt: null, id: { not: row.userId } },
        select: { id: true },
      });
      if (taken) return false;
      await tx.user.update({
        where: { id: row.userId },
        data: { email: oldEmail, emailNormalized },
      });
      // Any other pending change for this account is cancelled too.
      await tx.verificationToken.updateMany({
        where: { userId: row.userId, purpose: 'EMAIL_CHANGE', usedAt: null },
        data: { usedAt: new Date() },
      });
      await this.audit.record(
        {
          action: 'auth.email_change_reverted',
          actorUserId: row.userId,
          targetType: 'user',
          targetId: row.userId,
        },
        meta,
        tx,
      );
      return true;
    });
    if (!done) throw invalid();
    await this.sessions.revokeAll(row.userId);
  }
}
