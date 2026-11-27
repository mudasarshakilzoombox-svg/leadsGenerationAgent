import type { Metadata } from 'next';
import { AuthCard, ResetPasswordForm } from '@/components/auth/auth-forms';

export const metadata: Metadata = { title: 'Choose a new password' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <AuthCard
      title="Choose a new password"
      description="Every device signed in to your account will be signed out."
    >
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}
