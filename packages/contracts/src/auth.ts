import { z } from 'zod';

/** Terms of Service / Privacy Policy / AUP version the signup form shows (PRD AUTH-01 AC2). */
export const CURRENT_TERMS_VERSION = '2026-11';

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/** Unicode code points after NFKC normalization (08-authentication.md §3). */
export function passwordLength(password: string): number {
  return [...password.normalize('NFKC')].length;
}

export const PasswordSchema = z
  .string()
  .max(1024)
  .refine((value) => passwordLength(value) >= PASSWORD_MIN_LENGTH, {
    message: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
  })
  .refine((value) => passwordLength(value) <= PASSWORD_MAX_LENGTH, {
    message: `Use at most ${PASSWORD_MAX_LENGTH} characters.`,
  });

export const EmailSchema = z
  .string()
  .trim()
  .max(254)
  .pipe(z.email({ message: 'Enter a valid email address.' }));

/** Opaque base64url tokens from emails (32 random bytes = 43 chars). */
export const EmailTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{32,128}$/, { message: 'The link is invalid.' });

/** Display names: no control characters (they end up in email headers and logs). */
export const DisplayNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[^\p{Cc}]*$/u, { message: 'Remove line breaks and control characters.' });

export const SignupRequestSchema = z.strictObject({
  name: DisplayNameSchema,
  email: EmailSchema,
  password: PasswordSchema,
  acceptTerms: z.literal(true, { message: 'Accept the terms to continue.' }),
  termsVersion: z.literal(CURRENT_TERMS_VERSION, {
    message: 'Reload the page to accept the current terms.',
  }),
  turnstileToken: z.string().min(1).max(2048),
});
export type SignupRequest = z.infer<typeof SignupRequestSchema>;

export const LoginRequestSchema = z.strictObject({
  email: EmailSchema,
  // Not the full policy: existing accounts must always be able to try their password.
  password: z.string().min(1).max(1024),
  turnstileToken: z.string().min(1).max(2048).optional(),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const EmailOnlyRequestSchema = z.strictObject({ email: EmailSchema });
export type EmailOnlyRequest = z.infer<typeof EmailOnlyRequestSchema>;

export const TokenRequestSchema = z.strictObject({ token: EmailTokenSchema });
export type TokenRequest = z.infer<typeof TokenRequestSchema>;

export const PasswordResetRequestSchema = z.strictObject({
  token: EmailTokenSchema,
  newPassword: PasswordSchema,
});
export type PasswordResetRequest = z.infer<typeof PasswordResetRequestSchema>;

export const ReauthenticateRequestSchema = z.strictObject({
  password: z.string().min(1).max(1024),
});
export type ReauthenticateRequest = z.infer<typeof ReauthenticateRequestSchema>;

export const AcceptedResponseSchema = z.object({
  status: z.literal('accepted'),
  message: z.string(),
});
export type AcceptedResponse = z.infer<typeof AcceptedResponseSchema>;

export const UserSummarySchema = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string().nullable(),
  emailVerified: z.boolean(),
  /** Cosmetic: shows the admin entry. Admin data is gated by the admin API (MFA, IP allowlist). */
  isPlatformAdmin: z.boolean(),
  locale: z.string().nullable(),
  timezone: z.string().nullable(),
  /** False for accounts created with Google/Microsoft that never set a password. */
  hasPassword: z.boolean(),
});
export type UserSummary = z.infer<typeof UserSummarySchema>;

export const ROLE_KEY_VALUES = ['OWNER', 'ADMIN', 'MEMBER', 'READ_ONLY'] as const;
export const RoleKeySchema = z.enum(ROLE_KEY_VALUES);
export type RoleKeyValue = z.infer<typeof RoleKeySchema>;

export const MembershipSummarySchema = z.object({
  membershipId: z.uuid(),
  workspace: z.object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    status: z.string(),
    planKey: z.string(),
  }),
  roleKey: RoleKeySchema,
  permissions: z.array(z.string()),
});
export type MembershipSummary = z.infer<typeof MembershipSummarySchema>;

export const MeResponseSchema = z.object({
  user: UserSummarySchema,
  memberships: z.array(MembershipSummarySchema),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

export const SessionSummarySchema = z.object({
  id: z.uuid(),
  current: z.boolean(),
  userAgent: z.string().nullable(),
  ip: z.string().nullable(),
  createdAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
});
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

// ------------------------------------------------------------------ OAuth sign-in (AUTH-03)

/** Sign-in identity providers (08-authentication §4.3). Never mailbox providers. */
export const OAUTH_PROVIDERS = ['google', 'microsoft'] as const;
export const OAuthProviderSchema = z.enum(OAUTH_PROVIDERS);
export type OAuthProvider = z.infer<typeof OAuthProviderSchema>;

export const OAuthProvidersResponseSchema = z.object({ providers: z.array(OAuthProviderSchema) });
export type OAuthProvidersResponse = z.infer<typeof OAuthProvidersResponseSchema>;

export const OAuthStartQuerySchema = z.object({
  next: z.string().max(512).optional(),
  intent: z.enum(['login', 'link']).default('login'),
});

/** Error codes the OAuth callback puts on `/login?error=` (no secrets, no emails). */
export const OAUTH_ERROR_CODES = [
  'oauth_failed',
  'oauth_cancelled',
  'oauth_state',
  'oauth_unverified_email',
  'oauth_identity_in_use',
  'oauth_disabled',
  'oauth_link_expired',
] as const;
export type OAuthErrorCode = (typeof OAUTH_ERROR_CODES)[number];

/** Pending identity link waiting for the account password (`/login/link`). */
export const OAuthPendingLinkSchema = z.object({
  provider: OAuthProviderSchema,
  /** Masked address of the existing account, e.g. `o•••@acme-growth.test`. */
  maskedEmail: z.string(),
});
export type OAuthPendingLink = z.infer<typeof OAuthPendingLinkSchema>;

export const OAuthLinkRequestSchema = z.strictObject({ password: z.string().min(1).max(1024) });
export type OAuthLinkRequest = z.infer<typeof OAuthLinkRequestSchema>;

export const AuthIdentitySchema = z.object({
  id: z.uuid(),
  provider: OAuthProviderSchema,
  email: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type AuthIdentitySummary = z.infer<typeof AuthIdentitySchema>;
export const AuthIdentitiesResponseSchema = z.object({ data: z.array(AuthIdentitySchema) });

// ------------------------------------------------------------------ profile (AUTH-06)

/** Valid IANA time zone (as the runtime knows it). */
export const TimezoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine(
    (tz) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    { error: 'Choose a valid time zone.' },
  );

export const UpdateProfileRequestSchema = z
  .strictObject({
    name: DisplayNameSchema.optional(),
    timezone: TimezoneSchema.nullable().optional(),
  })
  .refine((v) => v.name !== undefined || v.timezone !== undefined, {
    error: 'Nothing to update.',
  });
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;

export const ChangePasswordRequestSchema = z.strictObject({
  currentPassword: z.string().min(1).max(1024),
  newPassword: PasswordSchema,
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

export const ChangeEmailRequestSchema = z.strictObject({ newEmail: EmailSchema });
export type ChangeEmailRequest = z.infer<typeof ChangeEmailRequestSchema>;
