import 'server-only';
import { type OAuthProvider, OAuthProvidersResponseSchema } from '@lga/contracts';
import { serverApi } from '@/lib/api/server';

/** Enabled sign-in providers. The sign-in pages must render even if the API is down: none then. */
export async function oauthProviders(): Promise<OAuthProvider[]> {
  try {
    return (
      await serverApi('/api/v1/auth/providers', OAuthProvidersResponseSchema, { timeoutMs: 3_000 })
    ).providers;
  } catch {
    return [];
  }
}
