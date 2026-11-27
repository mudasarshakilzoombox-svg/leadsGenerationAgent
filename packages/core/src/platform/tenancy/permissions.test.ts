import { describe, expect, it } from 'vitest';
import { resolvePermissions, ROLES, WORKSPACE_PERMISSIONS } from './permissions.js';

const approvalOn = { launchRequiresApproval: true };
const approvalOff = { launchRequiresApproval: false };

describe('permission matrix (SECURITY.md §3.2)', () => {
  it('gives the Owner every workspace permission', () => {
    expect([...resolvePermissions('OWNER', approvalOn)].sort()).toEqual(
      [...WORKSPACE_PERMISSIONS].sort(),
    );
  });

  it('keeps billing, deletion and ownership transfer Owner-only', () => {
    const admin = resolvePermissions('ADMIN', approvalOn);
    for (const p of [
      'billing.manage',
      'workspace.delete',
      'workspace.transfer_ownership',
    ] as const) {
      expect(admin.has(p)).toBe(false);
    }
    expect(admin.has('members.manage')).toBe(true);
    expect(admin.has('campaigns.approve_launch')).toBe(true);
  });

  it('lets Members launch only when launch approval is OFF', () => {
    const on = resolvePermissions('MEMBER', approvalOn);
    expect(on.has('campaigns.launch')).toBe(false);
    expect(on.has('campaigns.submit_for_approval')).toBe(true);
    expect(resolvePermissions('MEMBER', approvalOff).has('campaigns.launch')).toBe(true);
  });

  it('never lets Members approve launches or manage the workspace', () => {
    for (const ctx of [approvalOn, approvalOff]) {
      const member = resolvePermissions('MEMBER', ctx);
      for (const p of [
        'campaigns.approve_launch',
        'members.manage',
        'workspace.settings',
        'compliance.manage',
        'contacts.export',
        'audit.view',
        'mailboxes.manage_all',
      ] as const) {
        expect(member.has(p)).toBe(false);
      }
      expect(member.has('mailboxes.connect_own')).toBe(true);
      expect(member.has('drafts.approve')).toBe(true);
    }
  });

  it('fails closed for unknown roles', () => {
    expect(resolvePermissions('SUPER_ADMIN', approvalOff).size).toBe(0);
    expect(resolvePermissions('owner', approvalOff).size).toBe(0);
  });

  it('does not list a permission twice', () => {
    for (const role of Object.values(ROLES)) {
      expect(new Set(role.permissions).size).toBe(role.permissions.length);
    }
  });
});
