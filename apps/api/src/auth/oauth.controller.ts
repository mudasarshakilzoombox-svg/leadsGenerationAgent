import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  type OAuthLinkRequest,
  OAuthLinkRequestSchema,
  type OAuthPendingLink,
  type OAuthProvider,
  OAuthProviderSchema,
  type OAuthProvidersResponse,
  OAuthStartQuerySchema,
  type TokenRequest,
  TokenRequestSchema,
  type UserSummary,
} from '@lga/contracts';
import {
  type ApiEnv,
  APP_CONFIG,
  AUTH_TOKEN_TTL,
  DomainError,
  FakeOidcProvider,
  OAuthService,
  OIDC_PROVIDERS,
  type OidcProviderMap,
  type RequestMeta,
  ZodValidationPipe,
} from '@lga/core';
import type { CookieOptions, Response } from 'express';
import type { z } from 'zod';
import { readCookie, readSessionToken, setSessionCookie } from './cookies.js';
import { type AuthedRequest, Meta, Public } from './request-context.js';
import { toUserSummary } from './auth.controller.js';

/** OIDC state + PKCE verifier (signed, 10 min). Lax so the provider's top-level redirect sends it. */
export const OAUTH_STATE_COOKIE = '__Host-lga_oauth';
/** Pending identity link waiting for the account password (signed, 10 min). */
export const OAUTH_LINK_COOKIE = '__Host-lga_oauth_link';

const shortCookie: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
  maxAge: AUTH_TOKEN_TTL.oauthStateSeconds * 1000,
};

class ProviderPipe {
  transform(value: string): OAuthProvider {
    const parsed = OAuthProviderSchema.safeParse(value);
    if (!parsed.success) throw new DomainError('NOT_FOUND', 'Unknown sign-in method.');
    return parsed.data;
  }
}

/** Google and Microsoft sign-in (PRD AUTH-03, 08-authentication §4.3). */
@Controller('auth')
export class OAuthController {
  constructor(
    private readonly oauth: OAuthService,
    @Inject(OIDC_PROVIDERS) private readonly providers: OidcProviderMap,
    @Inject(APP_CONFIG) private readonly env: ApiEnv,
  ) {}

  private web(path: string): string {
    return new URL(path, this.env.APP_ORIGIN).href;
  }

  @Public()
  @Get('providers')
  providersList(): OAuthProvidersResponse {
    return { providers: this.oauth.enabledProviders() };
  }

  @Public()
  @Get('oauth/:provider/start')
  async start(
    @Param('provider', new ProviderPipe()) provider: OAuthProvider,
    @Query(new ZodValidationPipe(OAuthStartQuerySchema))
    query: z.infer<typeof OAuthStartQuerySchema>,
    @Meta() meta: RequestMeta,
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const { url, stateCookie } = await this.oauth.start(provider, query, meta, req.auth ?? null);
      res.cookie(OAUTH_STATE_COOKIE, stateCookie, shortCookie);
      res.redirect(302, url);
    } catch (error) {
      const code =
        error instanceof DomainError && error.code === 'UNAUTHENTICATED'
          ? 'oauth_state'
          : error instanceof DomainError && error.code === 'NOT_FOUND'
            ? 'oauth_disabled'
            : 'oauth_failed';
      if (error instanceof DomainError && error.code === 'RATE_LIMITED') throw error;
      res.redirect(302, this.web(`/login?error=${code}`));
    }
  }

  @Public()
  @Get('oauth/:provider/callback')
  async callback(
    @Param('provider', new ProviderPipe()) provider: OAuthProvider,
    @Meta() meta: RequestMeta,
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const query = new URL(req.originalUrl, 'http://callback').searchParams;
    const outcome = await this.oauth.callback(
      provider,
      query,
      readCookie(req.headers.cookie, OAUTH_STATE_COOKIE),
      meta,
      readSessionToken(req),
      req.auth ?? null,
    );
    // The state is single use, whatever happened.
    res.clearCookie(OAUTH_STATE_COOKIE, { ...shortCookie, maxAge: undefined });
    switch (outcome.kind) {
      case 'signed_in':
        setSessionCookie(res, outcome.login.token);
        res.redirect(302, this.web(outcome.next ?? (outcome.isNewUser ? '/workspaces' : '/')));
        return;
      case 'linked':
        res.redirect(302, this.web(outcome.next ?? '/'));
        return;
      case 'pending_password':
        res.cookie(OAUTH_LINK_COOKIE, outcome.linkCookie, shortCookie);
        res.redirect(302, this.web(`/login/link?provider=${provider}`));
        return;
      case 'email_sent':
        res.redirect(302, this.web(`/login/link?provider=${provider}&sent=1`));
        return;
      case 'error':
        res.redirect(302, this.web(`/login?error=${outcome.code}`));
        return;
    }
  }

  @Public()
  @Get('oauth/link')
  pendingLink(@Req() req: AuthedRequest): Promise<OAuthPendingLink> {
    return this.oauth.pendingLink(readCookie(req.headers.cookie, OAUTH_LINK_COOKIE));
  }

  @Public()
  @Post('oauth/link')
  @HttpCode(200)
  async link(
    @Body(new ZodValidationPipe(OAuthLinkRequestSchema)) body: OAuthLinkRequest,
    @Meta() meta: RequestMeta,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: UserSummary; next: string | null }> {
    const { login, next } = await this.oauth.linkWithPassword(
      readCookie(req.headers.cookie, OAUTH_LINK_COOKIE),
      body.password,
      meta,
      readSessionToken(req),
    );
    res.clearCookie(OAUTH_LINK_COOKIE, { ...shortCookie, maxAge: undefined });
    setSessionCookie(res, login.token);
    return { user: toUserSummary(login.session.user), next };
  }

  @Public()
  @Post('oauth/link/confirm')
  @HttpCode(200)
  async confirmLink(
    @Body(new ZodValidationPipe(TokenRequestSchema)) body: TokenRequest,
    @Meta() meta: RequestMeta,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: UserSummary }> {
    const login = await this.oauth.confirmEmailedLink(body.token, meta, readSessionToken(req));
    setSessionCookie(res, login.token);
    return { user: toUserSummary(login.session.user) };
  }

  // ------------------------------------------------------------------ fake identity provider

  private fake(provider: OAuthProvider): FakeOidcProvider {
    const fake = this.providers[provider];
    if (this.env.INTEGRATIONS_MODE !== 'fake' || !(fake instanceof FakeOidcProvider)) {
      throw new DomainError('NOT_FOUND', 'Not found.');
    }
    return fake;
  }

  /** Dev-only stand-in for the provider's sign-in page (INTEGRATIONS_MODE=fake). */
  @Public()
  @Get('oauth/fake/:provider')
  fakeLoginPage(
    @Param('provider', new ProviderPipe()) provider: OAuthProvider,
    @Query('state') state: string | undefined,
    @Query('nonce') nonce: string | undefined,
    @Res() res: Response,
  ): void {
    this.fake(provider);
    const label = provider === 'google' ? 'Google' : 'Microsoft';
    const attr = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    res
      .status(200)
      .type('html')
      .send(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fake ${label} sign-in</title></head>` +
          `<body style="font-family:system-ui,sans-serif;max-width:420px;margin:48px auto;padding:0 16px">` +
          `<h1 style="font-size:20px">Fake ${label} sign-in</h1>` +
          `<p style="color:#555">Development only (INTEGRATIONS_MODE=fake). Choose the identity to sign in as.</p>` +
          `<form method="get" action="/api/v1/auth/oauth/fake/${provider}/authorize">` +
          `<input type="hidden" name="state" value="${attr(state ?? '')}"><input type="hidden" name="nonce" value="${attr(nonce ?? '')}">` +
          `<p><label>Email<br><input name="email" type="email" required style="width:100%;padding:8px" autocomplete="off"></label></p>` +
          `<p><label>Name<br><input name="name" style="width:100%;padding:8px"></label></p>` +
          `<p><label><input type="checkbox" name="verified" value="1" checked> Email verified by ${label}</label></p>` +
          `<p><button type="submit" style="padding:10px 16px">Continue</button></p></form></body></html>`,
      );
  }

  @Public()
  @Get('oauth/fake/:provider/authorize')
  async fakeAuthorize(
    @Param('provider', new ProviderPipe()) provider: OAuthProvider,
    @Query() query: Record<string, string | undefined>,
    @Res() res: Response,
  ): Promise<void> {
    const fake = this.fake(provider);
    const email = (query.email ?? '').trim();
    if (!query.state || !query.nonce || !/^[^\s@]+@[^\s@]+$/.test(email)) {
      throw new DomainError('VALIDATION_FAILED', 'Email, state and nonce are required.');
    }
    const code = await fake.issueCode({
      email,
      name: query.name?.trim() || null,
      emailVerified: query.verified === '1',
      nonce: query.nonce,
      state: query.state,
    });
    const callback = new URL(`/api/v1/auth/oauth/${provider}/callback`, this.env.APP_ORIGIN);
    callback.searchParams.set('code', code);
    callback.searchParams.set('state', query.state);
    res.redirect(302, callback.href);
  }
}
