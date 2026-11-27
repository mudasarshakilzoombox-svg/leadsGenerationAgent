// Nest wiring for the identity, workspace and notification modules (shared by api and worker).
import { type DynamicModule, Module } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { APP_CONFIG } from '../config/config.module.js';
import type { ApiEnv, BaseServerEnv, WorkerEnv } from '../config/env.js';
import { RateLimiter } from '../platform/rate-limit/rate-limiter.js';
import { valkeyKey } from '../queue/jobs.js';
import { REDIS } from '../redis/redis.module.js';
import type { Redis } from 'ioredis';
import { FieldCrypto } from '../security/field-crypto.js';
import { SafeFetch } from '../security/safe-fetch.js';
import { UnsubscribeTokens } from '../security/signed-token.js';
import { AccountQueries } from './account/account.queries.js';
import { AuditService } from './audit/audit.service.js';
import { AuthService } from './identity/application/auth.service.js';
import { SessionService } from './identity/application/session.service.js';
import {
  BREACHED_PASSWORD_CHECKER,
  FakeBreachedPasswordChecker,
  HibpBreachedPasswordChecker,
} from './identity/infrastructure/breached-passwords.js';
import {
  FakeHumanVerifier,
  HUMAN_VERIFIER,
  TurnstileHumanVerifier,
} from './identity/infrastructure/human-verifier.js';
import { PasswordHasher } from './identity/infrastructure/password-hasher.js';
import {
  FakeOidcProvider,
  OIDC_PROVIDERS,
  type OidcProviderMap,
  OpenIdClientProvider,
} from './identity/infrastructure/oidc-provider.js';
import { OAuthService } from './identity/application/oauth.service.js';
import { ProfileService } from './identity/application/profile.service.js';
import { InsightsQueries } from './insights/insights.queries.js';
import { NotificationDeliveryService } from './notifications/notification-delivery.service.js';
import { NotificationDispatcher } from './notifications/notification-dispatcher.js';
import {
  CaptureSystemMailer,
  SmtpSystemMailer,
  SYSTEM_MAILER,
} from './notifications/system-mailer.js';
import { OutreachQueries } from './outreach/outreach.queries.js';
import { ProspectsQueries } from './prospects/prospects.queries.js';
import { InvitationsService } from './workspaces/application/invitations.service.js';
import { MembersService } from './workspaces/application/members.service.js';
import { SeatPolicy } from './workspaces/application/seat-policy.js';
import { WorkspaceService } from './workspaces/application/workspace.service.js';

/**
 * Audit, rate limits, the email dispatcher/deliverer and the security utilities (FieldCrypto,
 * UnsubscribeTokens, SafeFetch). Requires QueueModule.
 */
@Module({})
export class PlatformServicesModule {
  static forRoot(): DynamicModule {
    const providers = [
      AuditService,
      RateLimiter,
      NotificationDispatcher,
      NotificationDeliveryService,
      {
        provide: SYSTEM_MAILER,
        inject: [APP_CONFIG],
        useFactory: (env: BaseServerEnv & Partial<Pick<WorkerEnv, 'SMTP_URL' | 'MAIL_FROM'>>) =>
          env.SMTP_URL
            ? new SmtpSystemMailer(
                env.SMTP_URL,
                env.MAIL_FROM ?? 'Lead Generation Agent <no-reply@localhost>',
              )
            : new CaptureSystemMailer(),
      },
      {
        provide: FieldCrypto,
        inject: [APP_CONFIG],
        useFactory: (env: BaseServerEnv) => FieldCrypto.fromEnv(env),
      },
      {
        provide: UnsubscribeTokens,
        inject: [APP_CONFIG],
        useFactory: (env: BaseServerEnv) => UnsubscribeTokens.fromEnv(env),
      },
      {
        provide: SafeFetch,
        inject: [APP_CONFIG, PinoLogger],
        useFactory: (env: BaseServerEnv, logger: PinoLogger) => {
          logger.setContext(SafeFetch.name);
          return new SafeFetch({
            userAgent: `LeadGenAgentBot/1.0 (+${new URL('/bot', env.APP_ORIGIN).href})`,
            logger,
          });
        },
      },
    ];
    return { module: PlatformServicesModule, global: true, providers, exports: providers };
  }
}

/** Identity (signup, login, sessions) and workspaces (create, members, invitations). API only. */
@Module({})
export class IdentityModule {
  static forRoot(): DynamicModule {
    const providers = [
      PasswordHasher,
      SessionService,
      AuthService,
      WorkspaceService,
      MembersService,
      InvitationsService,
      SeatPolicy,
      // Read models for the dashboard (ADR-0035).
      InsightsQueries,
      ProspectsQueries,
      OutreachQueries,
      AccountQueries,
      {
        provide: BREACHED_PASSWORD_CHECKER,
        inject: [APP_CONFIG],
        useFactory: (env: ApiEnv) =>
          env.INTEGRATIONS_MODE === 'real'
            ? new HibpBreachedPasswordChecker()
            : new FakeBreachedPasswordChecker(),
      },
      {
        provide: HUMAN_VERIFIER,
        inject: [APP_CONFIG],
        useFactory: (env: ApiEnv) =>
          env.INTEGRATIONS_MODE === 'real' && env.TURNSTILE_SECRET_KEY
            ? new TurnstileHumanVerifier(env.TURNSTILE_SECRET_KEY)
            : new FakeHumanVerifier(),
      },
      OAuthService,
      ProfileService,
      {
        provide: OIDC_PROVIDERS,
        inject: [APP_CONFIG, REDIS],
        useFactory: (env: ApiEnv, redis: Redis): OidcProviderMap => {
          if (env.INTEGRATIONS_MODE === 'fake') {
            const prefix = valkeyKey(env, 'oauth-fake');
            return {
              google: new FakeOidcProvider('google', env.APP_ORIGIN, redis, prefix),
              microsoft: new FakeOidcProvider('microsoft', env.APP_ORIGIN, redis, prefix),
            };
          }
          const map: OidcProviderMap = {};
          if (env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET) {
            map.google = new OpenIdClientProvider(
              'google',
              env.GOOGLE_OAUTH_CLIENT_ID,
              env.GOOGLE_OAUTH_CLIENT_SECRET,
            );
          }
          if (env.MS_OAUTH_CLIENT_ID && env.MS_OAUTH_CLIENT_SECRET) {
            map.microsoft = new OpenIdClientProvider(
              'microsoft',
              env.MS_OAUTH_CLIENT_ID,
              env.MS_OAUTH_CLIENT_SECRET,
            );
          }
          return map;
        },
      },
    ];
    return { module: IdentityModule, global: true, providers, exports: providers };
  }
}
