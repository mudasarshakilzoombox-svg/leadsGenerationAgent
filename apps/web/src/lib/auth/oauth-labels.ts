// Plain values shared by Server and Client Components. They must not live in a 'use client'
// module: a Server Component that imports a value from one gets a client reference, not the value.
import type { OAuthErrorCode, OAuthProvider } from '@lga/contracts';

export const PROVIDER_LABEL: Record<OAuthProvider, string> = {
  google: 'Google',
  microsoft: 'Microsoft',
};

const OAUTH_ERRORS: Record<OAuthErrorCode, string> = {
  oauth_failed: 'We could not sign you in with that account. Please try again.',
  oauth_cancelled: 'Sign-in was cancelled.',
  oauth_state: 'That sign-in attempt expired or was opened in another browser. Please start again.',
  oauth_unverified_email:
    'That account has no verified email address. Use another account or sign in with email.',
  oauth_identity_in_use: 'That account is already connected to another user.',
  oauth_disabled: 'That sign-in method is not available.',
  oauth_link_expired: 'That sign-in attempt expired. Please start again.',
};

/** Maps the `?error=` code the OAuth callback redirects with; unknown codes get the generic text. */
export function oauthErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  return OAUTH_ERRORS[code as OAuthErrorCode] ?? OAUTH_ERRORS.oauth_failed;
}
