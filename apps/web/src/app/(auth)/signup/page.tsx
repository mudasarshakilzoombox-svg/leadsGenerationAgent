import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthCard, SignupForm } from '@/components/auth/auth-forms';
import { serverEnv } from '@/env';
import { getSessionOrNull, homePath } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Create account' };

export default async function SignupPage() {
  const session = await getSessionOrNull();
  if (session) redirect(homePath(session));
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <AuthCard
      title="Create your account"
      description="Start a 14-day trial. No card required."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-foreground hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SignupForm siteKey={serverEnv.TURNSTILE_SITE_KEY} nonce={nonce} />
    </AuthCard>
  );
}
