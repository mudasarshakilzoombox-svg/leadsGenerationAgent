import { CampaignDetailSchema } from '@lga/contracts';
import type { Metadata } from 'next';
import { CampaignDetailView } from '@/features/outreach';
import { loadDetail } from '@/lib/load-detail';

export const metadata: Metadata = { title: 'Campaign' };

export default async function CampaignPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; campaignId: string }>;
}) {
  const campaign = await loadDetail(
    params,
    (p) => `campaigns/${p.campaignId}`,
    CampaignDetailSchema,
  );
  return <CampaignDetailView campaign={campaign} />;
}
