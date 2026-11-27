import { OAuthProviderSchema } from '@lga/contracts';
import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth/auth-forms';
import { LinkAccount, PROVIDER_LABEL } from '@/components/auth/oauth';

export const metadata: Metadata = { title: 'Connect account' };

/** AUTH-03 AC2: an existing account must prove ownership before a new sign-in method is linked. */
export default async function LinkAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ provider?: string; sent?: string }>;
}) {
  const { provider: raw, sent } = await searchParams;
  const provider = OAuthProviderSchema.catch('google').parse(raw);
  return (
    <AuthCard title={`Connect ${PROVIDER_LABEL[provider]}`}>
      <LinkAccount provider={provider} sent={sent === '1'} />
    </AuthCard>
  );
}
