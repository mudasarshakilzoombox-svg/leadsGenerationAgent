import { DomainError } from '../../errors/domain-error.js';
import type { WorkspaceAccess } from '../../tenancy/workspace-access.service.js';

/** Dashboard filters (ADR-0036): a project (business profile) and/or one of its campaigns. */
export interface CampaignScopeFilter {
  project?: string | undefined;
  campaign?: string | undefined;
}

/**
 * Resolve dashboard filters to the campaign ids they cover, inside the tenant. Returns `null`
 * when nothing is filtered (the whole workspace). Ids that do not exist in this workspace, or a
 * campaign that belongs to another project, are a 404 (never a silently empty result).
 */
export async function resolveCampaignScope(
  access: WorkspaceAccess,
  filter: CampaignScopeFilter,
): Promise<string[] | null> {
  if (!filter.project && !filter.campaign) return null;
  if (filter.project) {
    const profile = await access.db.businessProfile.findFirst({
      where: { id: filter.project, deletedAt: null },
      select: { id: true },
    });
    if (!profile) throw new DomainError('NOT_FOUND', 'Project not found.');
  }
  if (filter.campaign) {
    const campaign = await access.db.campaign.findFirst({
      where: {
        id: filter.campaign,
        deletedAt: null,
        ...(filter.project ? { businessProfileId: filter.project } : {}),
      },
      select: { id: true },
    });
    if (!campaign) throw new DomainError('NOT_FOUND', 'Campaign not found.');
    return [campaign.id];
  }
  // Include deleted campaigns: their past sends still belong to the project's history.
  const campaigns = await access.db.campaign.findMany({
    where: { businessProfileId: filter.project },
    select: { id: true },
  });
  return campaigns.map((c) => c.id);
}
