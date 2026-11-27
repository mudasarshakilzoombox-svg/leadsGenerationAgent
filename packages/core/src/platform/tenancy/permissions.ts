// Permission catalog and role matrix (docs/SECURITY.md §3.2). Code checks permissions, never role
// names. The `roles` table is a synced copy for foreign keys (ADR-0033).

export const PLATFORM_PERMISSIONS = [
  'platform.workspaces.manage',
  'platform.killswitch',
  'platform.impersonate',
] as const;
export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

export const WORKSPACE_PERMISSIONS = [
  'workspace.delete',
  'workspace.transfer_ownership',
  'billing.manage',
  'members.manage',
  'workspace.settings',
  'integrations.manage',
  'mailboxes.connect_own',
  'mailboxes.manage_all',
  'sending_domains.manage',
  'compliance.manage',
  'audit.view',
  'contacts.export',
  'business.edit',
  'icp.edit',
  'prospects.discover',
  'prospects.import',
  'contacts.enrich',
  'contacts.verify',
  'campaigns.edit',
  'drafts.generate',
  'drafts.approve',
  'campaigns.launch',
  'campaigns.submit_for_approval',
  'campaigns.approve_launch',
  'inbox.reply',
  'inbox.assign',
  'classifications.override',
  'meetings.manage',
  'analytics.view',
] as const;
export type WorkspacePermission = (typeof WORKSPACE_PERMISSIONS)[number];

export const ROLE_KEYS = ['OWNER', 'ADMIN', 'MEMBER', 'READ_ONLY'] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

const OWNER_ONLY: readonly WorkspacePermission[] = [
  'workspace.delete',
  'workspace.transfer_ownership',
  'billing.manage',
];

/** Granted to Members only when the workspace's `launchRequiresApproval` is OFF. */
const MEMBER_CONDITIONAL: readonly WorkspacePermission[] = ['campaigns.launch'];

const ADMIN_ONLY: readonly WorkspacePermission[] = [
  'members.manage',
  'workspace.settings',
  'integrations.manage',
  'mailboxes.manage_all',
  'sending_domains.manage',
  'compliance.manage',
  'audit.view',
  'contacts.export',
  'campaigns.approve_launch',
];

const ALL = WORKSPACE_PERMISSIONS;
const ADMIN = ALL.filter((p) => !OWNER_ONLY.includes(p));
const MEMBER = ADMIN.filter((p) => !ADMIN_ONLY.includes(p) && !MEMBER_CONDITIONAL.includes(p));
/**
 * READ_ONLY (ADR-0034): workspace membership already grants reading workspace data. Every other
 * permission is a change, a credit spend or a sensitive read (exports, audit log), so it has none
 * of them. New write permissions are therefore denied to READ_ONLY by default.
 */
const READ_ONLY: readonly WorkspacePermission[] = ['analytics.view'];

export interface RoleDefinition {
  name: string;
  description: string;
  /** Base permissions. Conditional grants are applied by `resolvePermissions`. */
  permissions: readonly WorkspacePermission[];
  sortOrder: number;
}

export const ROLES = {
  OWNER: {
    name: 'Owner',
    description: 'Full control, billing and ownership. Exactly one per workspace.',
    permissions: ALL,
    sortOrder: 0,
  },
  ADMIN: {
    name: 'Admin',
    description: 'Manages members, settings, integrations, compliance and approvals.',
    permissions: ADMIN,
    sortOrder: 1,
  },
  MEMBER: {
    name: 'Member',
    description: 'Builds and runs campaigns. Launches need approval while launch approval is on.',
    permissions: MEMBER,
    sortOrder: 2,
  },
  READ_ONLY: {
    name: 'Read-only',
    description:
      'Can view workspace data and analytics. Cannot change anything, spend credits or export.',
    permissions: READ_ONLY,
    sortOrder: 3,
  },
} as const satisfies Record<RoleKey, RoleDefinition>;

export interface PermissionContext {
  /** Workspace setting (PRD WS-06). Defaults to ON. */
  launchRequiresApproval: boolean;
}

export function isRoleKey(value: string): value is RoleKey {
  return (ROLE_KEYS as readonly string[]).includes(value);
}

/** Effective permissions of a workspace role. Unknown roles get nothing (fail closed). */
export function resolvePermissions(
  roleKey: string,
  context: PermissionContext,
): ReadonlySet<WorkspacePermission> {
  if (!isRoleKey(roleKey)) return new Set();
  const granted = new Set<WorkspacePermission>(ROLES[roleKey].permissions);
  if (roleKey === 'MEMBER' && !context.launchRequiresApproval) {
    for (const p of MEMBER_CONDITIONAL) granted.add(p);
  }
  return granted;
}
