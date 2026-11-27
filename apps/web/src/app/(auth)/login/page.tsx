import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthCard, LoginForm } from '@/components/auth/auth-forms';
import { OAuthButtons, oauthErrorMessage } from '@/components/auth/oauth';
import { FormMessage } from '@/components/forms';
import { oauthProviders } from '@/lib/auth/providers';
import { serverEnv } from '@/env';
import { getSessionOrNull, homePath, safeNext } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const target = safeNext(next);
  const session = await getSessionOrNull();
  if (session) redirect(target ?? homePath(session));
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const providers = await oauthProviders();
  const oauthError = oauthErrorMessage(error);
  return (
    <AuthCard
      title="Sign in"
      description="Welcome back. Sign in to your workspace."
      footer={
        <>
          New here?{' '}
          <Link
            href={target ? `/signup?next=${encodeURIComponent(target)}` : '/signup'}
            className="font-medium text-foreground hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      <div className="space-y-5">
        {oauthError && <FormMessage tone="error">{oauthError}</FormMessage>}
        <OAuthButtons providers={providers} next={target} mode="login" />
        <LoginForm next={target} siteKey={serverEnv.TURNSTILE_SITE_KEY} nonce={nonce} />
      </div>
    </AuthCard>
  );
}
