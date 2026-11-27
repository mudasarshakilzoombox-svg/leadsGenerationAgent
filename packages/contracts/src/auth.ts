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
  locale: z.string().nullable(),
  timezone: z.string().nullable(),
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
