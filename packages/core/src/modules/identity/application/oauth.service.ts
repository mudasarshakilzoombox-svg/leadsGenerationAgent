import { createHmac } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  type AuthIdentitySummary,
  CURRENT_TERMS_VERSION,
  type OAuthErrorCode,
  type OAuthPendingLink,
  type OAuthProvider,
} from '@lga/contracts';
import { APP_CONFIG } from '../../../config/config.module.js';
import type { ApiEnv } from '../../../config/env.js';
import { PrismaService } from '../../../database/prisma.service.js';
import { DomainError } from '../../../errors/domain-error.js';
import { type IdentityProvider, Prisma } from '../../../generated/prisma/client.js';
import { RateLimiter } from '../../../platform/rate-limit/rate-limiter.js';
import { SignedTokens } from '../../../security/signed-token.js';
import { AuditService, type RequestMeta } from '../../audit/audit.service.js';
import { NotificationDispatcher } from '../../notifications/notification-dispatcher.js';
import { generateToken, hashToken, maskEmail, normalizeEmail } from '../domain/identity.js';
import { AUTH_TOKEN_TTL } from '../domain/token-ttl.js';
import {
  OIDC_PROVIDERS,
  type OidcProviderMap,
  oidcSecrets,
} from '../infrastructure/oidc-provider.js';
import { AuthService, type LoginResult } from './auth.service.js';
import type { ActiveSession } from './session.service.js';

/**
 * Google and Microsoft sign-in (PRD AUTH-03, 08-authentication §4.3): authorization code + PKCE +
 * state + nonce. Linking rules: a known identity signs in; an email that matches an existing
 * account is linked only after proof of ownership (its password, or an emailed link for accounts
 * without one); otherwise a new, verified account is created.
 */

/** Relative in-app path only (no scheme, no host, no `//`): prevents open redirects. */
export function safeRedirectPath(next: string | undefined | null): string | null {
  if (!next || next.startsWith('//') || next.startsWith('/\\')) return null;
  return /^\/[A-Za-z0-9/_?=&%.~-]*$/.test(next) ? next : null;
}

/** API names (`google`) ↔ stored enum (`GOOGLE`). */
const toDb = (provider: OAuthProvider): IdentityProvider =>
  provider === 'google' ? 'GOOGLE' : 'MICROSOFT';
const fromDb = (provider: IdentityProvider): OAuthProvider =>
  provider === 'GOOGLE' ? 'google' : 'microsoft';

const STATE_PURPOSE = 'oauth-state';
const LINK_PURPOSE = 'oauth-link';
const LINK_EMAILS_PER_HOUR = {
  scope: 'auth:identity-link:user',
  limit: 3,
  windowSeconds: 3600,
} as const;

interface StatePayload {
  p: OAuthProvider;
  s: string;
  n: string;
  v: string;
  next: string | null;
  i: 'login' | 'link';
  /** For `link`: the signed-in user who started it (binds the flow to that account). */
  u: string | null;
}

interface LinkPayload {
  p: OAuthProvider;
  sub: string;
  email: string;
  u: string;
  next: string | null;
}

export type OAuthCallbackOutcome =
  | { kind: 'signed_in'; login: LoginResult; next: string | null; isNewUser: boolean }
  | { kind: 'linked'; next: string | null }
  | { kind: 'pending_password'; linkCookie: string }
  | { kind: 'email_sent' }
  | { kind: 'error'; code: OAuthErrorCode };

@Injectable()
export class OAuthService {
  private readonly signer: SignedTokens;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly limiter: RateLimiter,
    private readonly audit: AuditService,
    private readonly notify: NotificationDispatcher,
    @Inject(OIDC_PROVIDERS) private readonly providers: OidcProviderMap,
    @Inject(APP_CONFIG) private readonly env: ApiEnv,
  ) {
    // Cookies are signed with a key derived from SESSION_PEPPER (purpose-bound, never reused raw).
    const key = createHmac('sha256', env.SESSION_PEPPER).update('lga-oauth-cookies-v1').digest();
    this.signer = new SignedTokens(new Map([[1, key]]), 1);
  }

  enabledProviders(): OAuthProvider[] {
    return (Object.keys(this.providers) as OAuthProvider[]).sort();
  }

  redirectUri(provider: OAuthProvider): string {
    return new URL(`/api/v1/auth/oauth/${provider}/callback`, this.env.APP_ORIGIN).href;
  }

  private provider(name: OAuthProvider) {
    const provider = this.providers[name];
    if (!provider) throw new DomainError('NOT_FOUND', 'This sign-in method is not available.');
    return provider;
  }

  /** Begin the flow: returns the provider URL and the signed state cookie value. */
  async start(
    name: OAuthProvider,
    options: { next?: string | undefined; intent: 'login' | 'link' },
    meta: RequestMeta,
    session: ActiveSession | null,
  ): Promise<{ url: string; stateCookie: string }> {
    await this.auth.throttleIp(meta);
    const provider = this.provider(name);
    if (options.intent === 'link' && !session) {
      throw new DomainError('UNAUTHENTICATED', 'Sign in to connect another sign-in method.');
    }
    const secrets = oidcSecrets();
    const payload: StatePayload = {
      p: name,
      s: secrets.state,
      n: secrets.nonce,
      v: secrets.codeVerifier,
      next: safeRedirectPath(options.next),
      i: options.intent,
      u: options.intent === 'link' ? session!.userId : null,
    };
    const stateCookie = this.signer.issue(
      STATE_PURPOSE,
      { ...payload },
      { ttlSeconds: AUTH_TOKEN_TTL.oauthStateSeconds },
    );
    const url = await provider.authorizationUrl({
      redirectUri: this.redirectUri(name),
      state: secrets.state,
      nonce: secrets.nonce,
      codeChallenge: secrets.codeChallenge,
    });
    return { url: url.href, stateCookie };
  }

  /** The provider redirected back. Never throws for user-facing failures: returns an error code. */
  async callback(
    name: OAuthProvider,
    query: URLSearchParams,
    stateCookie: string | undefined,
    meta: RequestMeta,
    currentToken: string | undefined,
    session: ActiveSession | null,
  ): Promise<OAuthCallbackOutcome> {
    await this.auth.throttleIp(meta);
    const provider = this.providers[name];
    if (!provider) return { kind: 'error', code: 'oauth_disabled' };
    const state = stateCookie
      ? (this.signer.verify(STATE_PURPOSE, stateCookie) as StatePayload | null)
      : null;
    if (!state || state.p !== name || query.get('state') !== state.s)
      return { kind: 'error', code: 'oauth_state' };
    if (query.get('error')) {
      return {
        kind: 'error',
        code: query.get('error') === 'access_denied' ? 'oauth_cancelled' : 'oauth_failed',
      };
    }

    let identity;
    try {
      identity = await provider.exchange(new URL(`${this.redirectUri(name)}?${query.toString()}`), {
        state: state.s,
        nonce: state.n,
        codeVerifier: state.v,
        redirectUri: this.redirectUri(name),
      });
    } catch {
      return { kind: 'error', code: 'oauth_failed' };
    }

    // 1. Known identity.
    const existing = await this.prisma.authIdentity.findUnique({
      where: {
        provider_providerSubject: { provider: toDb(name), providerSubject: identity.subject },
      },
      select: { userId: true, user: { select: { deletedAt: true } } },
    });
    if (existing && !existing.user.deletedAt) {
      if (state.i === 'link') {
        return existing.userId === state.u
          ? { kind: 'linked', next: state.next }
          : { kind: 'error', code: 'oauth_identity_in_use' };
      }
      const login = await this.auth.signIn(existing.userId, meta, currentToken, { method: name });
      return { kind: 'signed_in', login, next: state.next, isNewUser: false };
    }

    // 2. A signed-in user connecting a new method: bound to the user who started the flow.
    if (state.i === 'link') {
      if (!session || session.userId !== state.u) return { kind: 'error', code: 'oauth_state' };
      await this.createIdentity(session.userId, name, identity.subject, identity.email, meta);
      return { kind: 'linked', next: state.next };
    }

    if (!identity.email || !identity.emailVerified)
      return { kind: 'error', code: 'oauth_unverified_email' };
    const emailNormalized = normalizeEmail(identity.email);
    const user = await this.prisma.user.findFirst({
      where: { emailNormalized, deletedAt: null },
      select: { id: true, passwordHash: true },
    });

    // 3. Existing password account: confirm the password before linking (AUTH-03 AC2).
    if (user?.passwordHash) {
      const link: LinkPayload = {
        p: name,
        sub: identity.subject,
        email: emailNormalized,
        u: user.id,
        next: state.next,
      };
      return {
        kind: 'pending_password',
        linkCookie: this.signer.issue(
          LINK_PURPOSE,
          { ...link },
          { ttlSeconds: AUTH_TOKEN_TTL.oauthStateSeconds },
        ),
      };
    }

    // 4. Existing account without a password: prove ownership through its inbox.
    if (user) {
      const allowed = await this.limiter.hit(LINK_EMAILS_PER_HOUR, user.id);
      if (allowed.allowed) {
        const row = await this.prisma.verificationToken.create({
          data: {
            userId: user.id,
            purpose: 'IDENTITY_LINK',
            // Placeholder: the worker mints the real token at send time (ADR-0034).
            tokenHash: hashToken(generateToken()),
            payload: { provider: name, subject: identity.subject, email: emailNormalized },
            expiresAt: new Date(Date.now() + AUTH_TOKEN_TTL.identityLinkSeconds * 1000),
          },
          select: { id: true },
        });
        await this.notify.email(
          'auth.identity_link',
          { type: 'verification_token', id: row.id },
          { requestId: meta.requestId },
        );
      }
      return { kind: 'email_sent' };
    }

    // 5. New account: the provider verified the address (AUTH-03 AC1).
    let userId: string;
    try {
      userId = await this.prisma.$transaction(async (tx) => {
        const now = new Date();
        const created = await tx.user.create({
          data: {
            email: identity.email!,
            emailNormalized,
            name: identity.name?.slice(0, 100) ?? null,
            emailVerifiedAt: now,
            termsVersionAccepted: CURRENT_TERMS_VERSION,
            termsAcceptedAt: now,
          },
          select: { id: true },
        });
        await tx.authIdentity.create({
          data: {
            userId: created.id,
            provider: toDb(name),
            providerSubject: identity.subject,
            email: emailNormalized,
          },
        });
        await this.audit.record(
          {
            action: 'auth.signup',
            actorUserId: created.id,
            targetType: 'user',
            targetId: created.id,
            metadata: { method: name },
          },
          meta,
          tx,
        );
        return created.id;
      });
    } catch (error) {
      // Lost a race with another signup for the same address: ask them to try again.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { kind: 'error', code: 'oauth_failed' };
      }
      throw error;
    }
    const login = await this.auth.signIn(userId, meta, currentToken, { method: name });
    return { kind: 'signed_in', login, next: state.next, isNewUser: true };
  }

  /** What `/login/link` shows: which provider, for which (masked) account. */
  async pendingLink(linkCookie: string | undefined): Promise<OAuthPendingLink> {
    const link = this.readLink(linkCookie);
    const user = await this.prisma.user.findFirst({
      where: { id: link.u, deletedAt: null },
      select: { email: true },
    });
    if (!user) throw this.linkExpired();
    return { provider: link.p, maskedEmail: maskEmail(user.email) };
  }

  /** Link after the account password is confirmed (lockout and delay as for login). */
  async linkWithPassword(
    linkCookie: string | undefined,
    password: string,
    meta: RequestMeta,
    currentToken: string | undefined,
  ): Promise<{ login: LoginResult; next: string | null }> {
    const link = this.readLink(linkCookie);
    const user = await this.prisma.user.findFirst({
      where: { id: link.u, deletedAt: null },
      select: { id: true, emailNormalized: true },
    });
    if (!user) throw this.linkExpired();
    try {
      await this.auth.verifyAccountPassword(user.id, user.emailNormalized, password, meta);
    } catch (error) {
      if (error instanceof DomainError && error.code === 'UNAUTHENTICATED') {
        throw new DomainError('VALIDATION_FAILED', 'The password is incorrect.', {
          errors: [
            {
              pointer: '/password',
              code: 'password_incorrect',
              message: 'The password is incorrect.',
            },
          ],
        });
      }
      throw error;
    }
    await this.createIdentity(user.id, link.p, link.sub, link.email, meta);
    const login = await this.auth.signIn(user.id, meta, currentToken, { method: link.p });
    return { login, next: link.next };
  }

  /** Link from the emailed confirmation (accounts without a password). */
  async confirmEmailedLink(
    token: string,
    meta: RequestMeta,
    currentToken: string | undefined,
  ): Promise<LoginResult> {
    await this.auth.throttleIp(meta);
    const invalid = () =>
      new DomainError(
        'VALIDATION_FAILED',
        'This link is invalid or has expired. Try signing in again.',
        {
          errors: [
            {
              pointer: '/token',
              code: 'token_invalid',
              message: 'This link is invalid or has expired.',
            },
          ],
        },
      );
    const row = await this.prisma.verificationToken.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        id: true,
        userId: true,
        purpose: true,
        payload: true,
        usedAt: true,
        expiresAt: true,
        user: { select: { deletedAt: true } },
      },
    });
    if (
      !row ||
      row.purpose !== 'IDENTITY_LINK' ||
      row.usedAt ||
      row.expiresAt <= new Date() ||
      row.user.deletedAt
    ) {
      throw invalid();
    }
    const payload = row.payload as {
      provider?: OAuthProvider;
      subject?: string;
      email?: string;
    } | null;
    if (!payload?.provider || !payload.subject) throw invalid();
    const used = await this.prisma.verificationToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (used.count !== 1) throw invalid();
    await this.createIdentity(
      row.userId,
      payload.provider,
      payload.subject,
      payload.email ?? null,
      meta,
    );
    return this.auth.signIn(row.userId, meta, currentToken, { method: payload.provider });
  }

  async identities(userId: string): Promise<AuthIdentitySummary[]> {
    const rows = await this.prisma.authIdentity.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, provider: true, email: true, createdAt: true },
    });
    return rows.map((r) => ({
      ...r,
      provider: fromDb(r.provider),
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** Disconnect a sign-in method, never the last way to sign in. */
  async unlink(session: ActiveSession, identityId: string, meta: RequestMeta): Promise<void> {
    const [identity, user, count] = await Promise.all([
      this.prisma.authIdentity.findFirst({
        where: { id: identityId, userId: session.userId },
        select: { id: true, provider: true },
      }),
      this.prisma.user.findUnique({
        where: { id: session.userId },
        select: { passwordHash: true },
      }),
      this.prisma.authIdentity.count({ where: { userId: session.userId } }),
    ]);
    if (!identity) throw new DomainError('NOT_FOUND', 'Sign-in method not found.');
    if (!user?.passwordHash && count <= 1) {
      throw new DomainError(
        'CONFLICT',
        'Set a password or connect another sign-in method before removing this one.',
      );
    }
    await this.prisma.authIdentity.delete({ where: { id: identity.id } });
    await this.audit.record(
      {
        action: 'auth.identity_unlinked',
        actorUserId: session.userId,
        targetType: 'auth_identity',
        targetId: identity.id,
        metadata: { provider: fromDb(identity.provider) },
      },
      meta,
    );
  }

  private readLink(cookie: string | undefined): LinkPayload {
    const link = cookie ? (this.signer.verify(LINK_PURPOSE, cookie) as LinkPayload | null) : null;
    if (!link) throw this.linkExpired();
    return link;
  }

  private linkExpired(): DomainError {
    return new DomainError(
      'NOT_FOUND',
      'This sign-in attempt expired. Start again from the sign-in page.',
    );
  }

  private async createIdentity(
    userId: string,
    provider: OAuthProvider,
    subject: string,
    email: string | null,
    meta: RequestMeta,
  ) {
    try {
      const created = await this.prisma.authIdentity.create({
        data: { userId, provider: toDb(provider), providerSubject: subject, email },
        select: { id: true },
      });
      await this.audit.record(
        {
          action: 'auth.identity_linked',
          actorUserId: userId,
          targetType: 'auth_identity',
          targetId: created.id,
          metadata: { provider },
        },
        meta,
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DomainError('CONFLICT', 'This account is already connected to another user.');
      }
      throw error;
    }
  }
}
