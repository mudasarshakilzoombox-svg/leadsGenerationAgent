import type { Metadata } from 'next';
import { AuthCard, VerifyEmail } from '@/components/auth/auth-forms';

export const metadata: Metadata = { title: 'Confirm email' };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <AuthCard title="Confirm your email">
      <VerifyEmail token={token} />
    </AuthCard>
  );
}
