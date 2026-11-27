import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { APP_CONFIG } from '../../../config/config.module.js';
import type { ApiEnv } from '../../../config/env.js';
import { PrismaService } from '../../../database/prisma.service.js';
import { valkeyKey } from '../../../queue/jobs.js';
import { REDIS } from '../../../redis/redis.module.js';
import type { RequestMeta } from '../../audit/index.js';
import { generateToken, hashSessionToken } from '../domain/identity.js';
import { SESSION_TTL } from '../domain/token-ttl.js';

export interface SessionUser {
  id: string;
  email: string;
  emailNormalized: string;
  name: string | null;
  emailVerifiedAt: Date | null;
  platformRole: 'NONE' | 'SUPER_ADMIN';
  locale: string | null;
  timezone: string | null;
  /** False for Google/Microsoft-only accounts. Only the flag is kept: never the hash. */
  hasPassword: boolean;
}

export interface ActiveSession {
  id: string;
  userId: string;
  createdAt: Date;
  lastSeenAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  reauthenticatedAt: Date | null;
  user: SessionUser;
}

const userSelect = {
  id: true,
  email: true,
  emailNormalized: true,
  name: true,
  emailVerifiedAt: true,
  platformRole: true,
  locale: true,
  timezone: true,
  passwordHash: true,
  deletedAt: true,
} as const;

const DATE_FIELDS = [
  'createdAt',
  'lastSeenAt',
  'idleExpiresAt',
  'absoluteExpiresAt',
  'reauthenticatedAt',
] as const;

/**
 * Opaque server-side sessions (ADR-0007, 08-authentication.md §6).
 * The cookie holds 32 random bytes; the DB holds sha256(token || SESSION_PEPPER).
 * Resolved sessions are cached in Valkey for 60 s, and every revocation deletes the cache entry,
 * so revocation takes effect on the next request.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(APP_CONFIG) private readonly env: ApiEnv,
  ) {}

  private hash(token: string): Uint8Array<ArrayBuffer> {
    return hashSessionToken(token, this.env.SESSION_PEPPER);
  }

  private cacheKey(tokenHash: Uint8Array): string {
    return valkeyKey(this.env, 'sess', Buffer.from(tokenHash).toString('base64url'));
  }

  async create(
    userId: string,
    meta: RequestMeta,
  ): Promise<{ token: string; session: ActiveSession }> {
    const token = generateToken();
    const now = new Date();
    const absoluteExpiresAt = new Date(now.getTime() + SESSION_TTL.absoluteSeconds * 1000);
    const row = await this.prisma.session.create({
      data: {
        userId,
        tokenHash: this.hash(token),
        ip: meta.ip ?? null,
        userAgent: meta.userAgent?.slice(0, 512) ?? null,
        // One clock for every lifetime field (not the database's now()).
        createdAt: now,
        lastSeenAt: now,
        // A fresh login counts as recent authentication for step-up checks.
        reauthenticatedAt: now,
        idleExpiresAt: new Date(now.getTime() + SESSION_TTL.idleSeconds * 1000),
        absoluteExpiresAt,
      },
      include: { user: { select: userSelect } },
    });
    return { token, session: toActive(row) };
  }

  /** Validates a cookie token. Returns null for unknown, revoked or expired sessions. */
  async resolve(token: string | undefined): Promise<ActiveSession | null> {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const tokenHash = this.hash(token);
    const key = this.cacheKey(tokenHash);
    const now = new Date();

    let session = parseCached(await this.redis.get(key));
    if (!session) {
      const row = await this.prisma.session.findUnique({
        where: { tokenHash },
        include: { user: { select: userSelect } },
      });
      if (!row || row.revokedAt || row.user.deletedAt) return null;
      session = toActive(row);
    }
    if (session.idleExpiresAt <= now || session.absoluteExpiresAt <= now) {
      await this.redis.del(key);
      return null;
    }

    if (now.getTime() - session.lastSeenAt.getTime() > SESSION_TTL.touchIntervalSeconds * 1000) {
      const idleExpiresAt = new Date(
        Math.min(
          now.getTime() + SESSION_TTL.idleSeconds * 1000,
          session.absoluteExpiresAt.getTime(),
        ),
      );
      const updated = await this.prisma.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { lastSeenAt: now, idleExpiresAt },
      });
      if (updated.count === 0) {
        await this.redis.del(key);
        return null;
      }
      session = { ...session, lastSeenAt: now, idleExpiresAt };
    }

    const ttl = Math.min(
      SESSION_TTL.cacheSeconds,
      Math.floor(
        (Math.min(session.idleExpiresAt.getTime(), session.absoluteExpiresAt.getTime()) -
          now.getTime()) /
          1000,
      ),
    );
    if (ttl > 0) await this.redis.set(key, JSON.stringify(session), 'EX', ttl);
    return session;
  }

  /** Revoke one of the user's sessions. False when it does not exist or belongs to someone else. */
  async revoke(sessionId: string, userId: string): Promise<boolean> {
    const row = await this.prisma.session.findFirst({
      where: { id: sessionId, userId, revokedAt: null },
      select: { tokenHash: true },
    });
    if (!row) return false;
    await this.prisma.session.updateMany({
      where: { id: sessionId, userId },
      data: { revokedAt: new Date() },
    });
    await this.redis.del(this.cacheKey(row.tokenHash));
    return true;
  }

  /** Revoke every active session of a user (password reset, "sign out everywhere"). */
  async revokeAll(userId: string, exceptSessionId?: string): Promise<number> {
    const rows = await this.prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      select: { id: true, tokenHash: true },
    });
    if (rows.length === 0) return 0;
    await this.prisma.session.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { revokedAt: new Date() },
    });
    await this.redis.del(...rows.map((r) => this.cacheKey(r.tokenHash)));
    return rows.length;
  }

  /** Drop cached copies after user fields change (e.g. email verified), without revoking. */
  async invalidateUser(userId: string): Promise<void> {
    const rows = await this.prisma.session.findMany({
      where: { userId, revokedAt: null },
      select: { tokenHash: true },
    });
    if (rows.length > 0) await this.redis.del(...rows.map((r) => this.cacheKey(r.tokenHash)));
  }

  async markReauthenticated(sessionId: string): Promise<void> {
    const row = await this.prisma.session.update({
      where: { id: sessionId },
      data: { reauthenticatedAt: new Date() },
      select: { tokenHash: true },
    });
    await this.redis.del(this.cacheKey(row.tokenHash));
  }

  async list(userId: string) {
    return this.prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        idleExpiresAt: { gt: new Date() },
        absoluteExpiresAt: { gt: new Date() },
      },
      select: { id: true, ip: true, userAgent: true, createdAt: true, lastSeenAt: true },
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  /** Recent sessions used for new-device detection (last 90 days). */
  async recentDevices(userId: string): Promise<{ ip: string | null; userAgent: string | null }[]> {
    return this.prisma.session.findMany({
      where: { userId, createdAt: { gt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
      select: { ip: true, userAgent: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}

type SessionRow = {
  id: string;
  userId: string;
  createdAt: Date;
  lastSeenAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  reauthenticatedAt: Date | null;
  user: Omit<SessionUser, 'hasPassword'> & { deletedAt: Date | null; passwordHash: string | null };
};

function toActive(row: SessionRow): ActiveSession {
  const { deletedAt: _deleted, passwordHash, ...rest } = row.user;
  const user: SessionUser = { ...rest, hasPassword: passwordHash !== null };
  return {
    id: row.id,
    userId: row.userId,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    idleExpiresAt: row.idleExpiresAt,
    absoluteExpiresAt: row.absoluteExpiresAt,
    reauthenticatedAt: row.reauthenticatedAt,
    user,
  };
}

function parseCached(raw: string | null): ActiveSession | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown> & { user: Record<string, unknown> };
    for (const field of DATE_FIELDS) {
      const v = value[field];
      value[field] = typeof v === 'string' ? new Date(v) : null;
    }
    const verified = value.user.emailVerifiedAt;
    value.user.emailVerifiedAt = typeof verified === 'string' ? new Date(verified) : null;
    return value as unknown as ActiveSession;
  } catch {
    return null;
  }
}
