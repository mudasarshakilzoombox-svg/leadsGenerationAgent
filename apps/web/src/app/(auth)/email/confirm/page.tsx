import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth/auth-forms';
import { EmailChangeResult } from '@/components/auth/oauth';

export const metadata: Metadata = { title: 'Confirm new email' };

export default async function ConfirmEmailChangePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <AuthCard title="Confirm your new email">
      <EmailChangeResult token={token} kind="confirm" />
    </AuthCard>
  );
}
