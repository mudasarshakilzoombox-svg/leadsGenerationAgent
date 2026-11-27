import {
  type LaunchReadiness,
  PhysicalAddressSchema,
  PrivacyNoticeUrlSchema,
} from '@lga/contracts';

/**
 * Workspace-level launch prerequisites (PRD WS-06 AC1, APR-03, SendPolicy SP-09): every outreach
 * footer needs a physical postal address and a privacy-notice link. Pure: no I/O.
 */
export function launchReadiness(workspace: {
  physicalAddress: unknown;
  privacyNoticeUrl: string | null;
}): LaunchReadiness {
  const missing: LaunchReadiness['missing'] = [];
  if (!PhysicalAddressSchema.safeParse(workspace.physicalAddress).success) {
    missing.push('physicalAddress');
  }
  if (!PrivacyNoticeUrlSchema.safeParse(workspace.privacyNoticeUrl).success) {
    missing.push('privacyNoticeUrl');
  }
  return { ready: missing.length === 0, missing };
}
