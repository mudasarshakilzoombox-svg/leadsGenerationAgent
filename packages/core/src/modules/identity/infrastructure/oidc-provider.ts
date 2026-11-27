import { createHash, randomBytes } from 'node:crypto';
import type { OAuthProvider } from '@lga/contracts';
import type { Redis } from 'ioredis';
import * as oidc from 'openid-client';

/**
 * Sign-in identity providers (08-authentication §4.3). Login identities only: the scope is
 * `openid email profile`, never mailbox scopes (AUTH-03 AC3). Mailbox OAuth is a separate flow.
 */
export const OIDC_SCOPE = 'openid email profile';

export interface OidcIdentity {
  /** Stable subject (`sub`) at the provider. */
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

export interface OidcChecks {
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
}

export interface OidcProviderPort {
  readonly name: OAuthProvider;
  authorizationUrl(
    params: Omit<OidcChecks, 'codeVerifier'> & { codeChallenge: string },
  ): Promise<URL>;
  /** Exchange the code (PKCE) and validate the ID token (issuer, audience, nonce, expiry). */
  exchange(callbackUrl: URL, checks: OidcChecks): Promise<OidcIdentity>;
}

export const OIDC_PROVIDERS = Symbol.for('lga.OidcProviders');
export type OidcProviderMap = Partial<Record<OAuthProvider, OidcProviderPort>>;

/** PKCE pair and random state/nonce (RFC 7636, OIDC Core). */
export function oidcSecrets(): {
  state: string;
  nonce: string;
  codeVerifier: string;
  codeChallenge: string;
} {
  const codeVerifier = randomBytes(32).toString('base64url');
  return {
    state: randomBytes(16).toString('base64url'),
    nonce: randomBytes(16).toString('base64url'),
    codeVerifier,
    codeChallenge: createHash('sha256').update(codeVerifier).digest('base64url'),
  };
}

const ISSUERS: Record<OAuthProvider, string> = {
  google: 'https://accounts.google.com',
  // `common`: work, school and personal accounts. openid-client validates the templated issuer
  // (`https://login.microsoftonline.com/{tenantid}/v2.0`) with the `tid` from the token.
  microsoft: 'https://login.microsoftonline.com/common/v2.0',
};

/** Real provider through `openid-client` (certified OIDC relying party). */
export class OpenIdClientProvider implements OidcProviderPort {
  private config: Promise<oidc.Configuration> | undefined;

  constructor(
    readonly name: OAuthProvider,
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  private configuration(): Promise<oidc.Configuration> {
    // Discovery once per process; a failure is retried on the next sign-in attempt.
    this.config ??= oidc
      .discovery(new URL(ISSUERS[this.name]), this.clientId, this.clientSecret)
      .catch((error: unknown) => {
        this.config = undefined;
        throw error;
      });
    return this.config;
  }

  async authorizationUrl(
    params: Omit<OidcChecks, 'codeVerifier'> & { codeChallenge: string },
  ): Promise<URL> {
    return oidc.buildAuthorizationUrl(await this.configuration(), {
      redirect_uri: params.redirectUri,
      scope: OIDC_SCOPE,
      state: params.state,
      nonce: params.nonce,
      code_challenge: params.codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
  }

  async exchange(callbackUrl: URL, checks: OidcChecks): Promise<OidcIdentity> {
    const tokens = await oidc.authorizationCodeGrant(await this.configuration(), callbackUrl, {
      pkceCodeVerifier: checks.codeVerifier,
      expectedState: checks.state,
      expectedNonce: checks.nonce,
      idTokenExpected: true,
    });
    const claims = tokens.claims();
    if (!claims?.sub) throw new Error('ID token without subject');
    const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : null);
    if (this.name === 'google') {
      return {
        subject: claims.sub,
        email: str(claims.email),
        emailVerified: claims.email_verified === true,
        name: str(claims.name),
      };
    }
    // Microsoft: `email` when present, else the sign-in name. Linking an existing account always
    // requires proof of ownership (password or emailed link), so a tenant cannot take one over.
    return {
      subject: claims.sub,
      email: str(claims.email) ?? str(claims.preferred_username),
      emailVerified: Boolean(str(claims.email) ?? str(claims.preferred_username)),
      name: str(claims.name),
    };
  }
}

/**
 * Fake identity provider for INTEGRATIONS_MODE=fake (local dev and tests, refused in production).
 * Its authorization URL opens a dev page on our API where you type the identity to sign in as;
 * the page issues a one-time code stored in Valkey for 60 seconds.
 */
export const FAKE_CODE_TTL_SECONDS = 60;

export interface FakeIdpGrant {
  provider: OAuthProvider;
  email: string;
  name: string | null;
  emailVerified: boolean;
  nonce: string;
  state: string;
}

export function fakeSubject(provider: OAuthProvider, email: string): string {
  return `fake-${provider}-${createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 24)}`;
}

export class FakeOidcProvider implements OidcProviderPort {
  constructor(
    readonly name: OAuthProvider,
    private readonly appOrigin: string,
    private readonly redis: Pick<Redis, 'set' | 'getdel'>,
    private readonly keyPrefix: string,
  ) {}

  authorizationUrl(
    params: Omit<OidcChecks, 'codeVerifier'> & { codeChallenge: string },
  ): Promise<URL> {
    const url = new URL(`/api/v1/auth/oauth/fake/${this.name}`, this.appOrigin);
    url.searchParams.set('state', params.state);
    url.searchParams.set('nonce', params.nonce);
    url.searchParams.set('scope', OIDC_SCOPE);
    return Promise.resolve(url);
  }

  /** Called by the fake IdP page: issue a one-time code for the chosen identity. */
  async issueCode(grant: Omit<FakeIdpGrant, 'provider'>): Promise<string> {
    const code = randomBytes(16).toString('base64url');
    await this.redis.set(
      `${this.keyPrefix}:${code}`,
      JSON.stringify({ ...grant, provider: this.name }),
      'EX',
      FAKE_CODE_TTL_SECONDS,
    );
    return code;
  }

  async exchange(callbackUrl: URL, checks: OidcChecks): Promise<OidcIdentity> {
    if (callbackUrl.searchParams.get('state') !== checks.state) throw new Error('state mismatch');
    const code = callbackUrl.searchParams.get('code');
    if (!code) throw new Error('missing code');
    const raw = await this.redis.getdel(`${this.keyPrefix}:${code}`); // single use
    if (!raw) throw new Error('unknown or used code');
    const grant = JSON.parse(raw) as FakeIdpGrant;
    if (
      grant.provider !== this.name ||
      grant.nonce !== checks.nonce ||
      grant.state !== checks.state
    ) {
      throw new Error('nonce or state mismatch');
    }
    return {
      subject: fakeSubject(this.name, grant.email),
      email: grant.email,
      emailVerified: grant.emailVerified,
      name: grant.name,
    };
  }
}
