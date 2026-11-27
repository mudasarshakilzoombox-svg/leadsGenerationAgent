import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth/auth-forms';
import { ConfirmIdentityLink } from '@/components/auth/oauth';

export const metadata: Metadata = { title: 'Connect account' };

export default async function ConfirmLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <AuthCard title="Connect your account">
      <ConfirmIdentityLink token={token} />
    </AuthCard>
  );
}
