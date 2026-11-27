import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth/auth-forms';
import { EmailChangeResult } from '@/components/auth/oauth';

export const metadata: Metadata = { title: 'Undo email change' };

export default async function RevertEmailChangePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <AuthCard title="Undo email change">
      <EmailChangeResult token={token} kind="revert" />
    </AuthCard>
  );
}
