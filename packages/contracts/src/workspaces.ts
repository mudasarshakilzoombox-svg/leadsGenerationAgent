import { z } from 'zod';
import { DisplayNameSchema, EmailSchema, RoleKeySchema, TimezoneSchema } from './auth.js';

/** Roles that can be granted through invitations and role changes. OWNER only via transfer. */
export const ASSIGNABLE_ROLE_VALUES = ['ADMIN', 'MEMBER', 'READ_ONLY'] as const;
export const AssignableRoleSchema = z.enum(ASSIGNABLE_ROLE_VALUES);
export type AssignableRole = z.infer<typeof AssignableRoleSchema>;

export const CreateWorkspaceRequestSchema = z.strictObject({
  name: DisplayNameSchema,
  websiteUrl: z
    .url({ protocol: /^https?$/ })
    .max(2048)
    .optional(),
  timezone: TimezoneSchema.optional(),
});
export type CreateWorkspaceRequest = z.infer<typeof CreateWorkspaceRequestSchema>;

export const WorkspaceSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  status: z.string(),
  planKey: z.string(),
  trialEndsAt: z.iso.datetime().nullable(),
  defaultTimezone: z.string(),
  createdAt: z.iso.datetime(),
});
export type WorkspaceSummary = z.infer<typeof WorkspaceSummarySchema>;

// ------------------------------------------------------------------ settings (WS-06)

const trimmed = (max: number) => z.string().trim().min(1).max(max);

/**
 * `workspaces.physical_address` (jsonb). CAN-SPAM needs a valid postal address in every outreach
 * footer, so a launch needs at least a street line, a city and a country.
 */
export const PhysicalAddressSchema = z.strictObject({
  line1: trimmed(200),
  line2: trimmed(200).optional(),
  city: trimmed(100),
  region: trimmed(100).optional(),
  postalCode: trimmed(20).optional(),
  /** ISO 3166-1 alpha-2, upper case. */
  country: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, 'Use the two-letter country code, for example GB or US.')
    .transform((c) => c.toUpperCase()),
});
export type PhysicalAddress = z.infer<typeof PhysicalAddressSchema>;

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

/** ISO weekdays (1 = Monday … 7 = Sunday) and local start/end times, like campaign send windows. */
export const SendWindowSchema = z
  .strictObject({
    days: z
      .array(z.number().int().min(1).max(7))
      .min(1, 'Pick at least one day.')
      .max(7)
      .refine((d) => new Set(d).size === d.length, 'Each day once.')
      .transform((d) => [...d].sort((a, b) => a - b)),
    start: z.string().regex(CLOCK, 'Use HH:MM.'),
    end: z.string().regex(CLOCK, 'Use HH:MM.'),
  })
  .refine((w) => w.start < w.end, { message: 'End after start.', path: ['end'] });
export type SendWindow = z.infer<typeof SendWindowSchema>;

/** PRD CAM-06 default: Monday to Friday, 09:00 to 17:00. */
export const DEFAULT_SEND_WINDOW: SendWindow = {
  days: [1, 2, 3, 4, 5],
  start: '09:00',
  end: '17:00',
};

/**
 * Typed view of `workspaces.settings`. Unknown keys are kept for forward compatibility, and a
 * malformed field falls back to its safe default instead of failing the whole read.
 */
export const WorkspaceSettingsSchema = z.looseObject({
  /** PRD WS-06 AC2: Members need approval to launch. Defaults to ON. */
  launchRequiresApproval: z.boolean().default(true).catch(true),
  defaultSendWindow: SendWindowSchema.default(DEFAULT_SEND_WINDOW).catch(DEFAULT_SEND_WINDOW),
});
export type WorkspaceSettings = z.infer<typeof WorkspaceSettingsSchema>;

export const PrivacyNoticeUrlSchema = z
  .url({ protocol: /^https$/, message: 'Use a full https:// link.' })
  .max(2048);

/** PATCH /workspaces/:id. Absent = unchanged, null = clear (03-api §3). */
export const UpdateWorkspaceRequestSchema = z
  .strictObject({
    legalName: trimmed(200).nullable().optional(),
    physicalAddress: PhysicalAddressSchema.nullable().optional(),
    privacyNoticeUrl: PrivacyNoticeUrlSchema.nullable().optional(),
    defaultTimezone: TimezoneSchema.optional(),
    defaultSendWindow: SendWindowSchema.optional(),
    launchRequiresApproval: z.boolean().optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: 'Nothing to update.',
  });
export type UpdateWorkspaceRequest = z.infer<typeof UpdateWorkspaceRequestSchema>;

/** PRD WS-07 AC1: the Owner types the workspace name to confirm. */
export const DeleteWorkspaceRequestSchema = z.strictObject({
  confirmName: z.string().max(200),
});
export type DeleteWorkspaceRequest = z.infer<typeof DeleteWorkspaceRequestSchema>;

export const LAUNCH_REQUIREMENTS = ['physicalAddress', 'privacyNoticeUrl'] as const;
export const LaunchReadinessSchema = z.object({
  ready: z.boolean(),
  missing: z.array(z.enum(LAUNCH_REQUIREMENTS)),
});
export type LaunchReadiness = z.infer<typeof LaunchReadinessSchema>;

/** GET/PATCH /workspaces/:id. The ETag header carries `rowVersion` too. */
export const WorkspaceDetailSchema = WorkspaceSummarySchema.extend({
  legalName: z.string().nullable(),
  physicalAddress: PhysicalAddressSchema.nullable(),
  privacyNoticeUrl: z.string().nullable(),
  defaultSendWindow: SendWindowSchema,
  launchRequiresApproval: z.boolean(),
  launchReadiness: LaunchReadinessSchema,
  rowVersion: z.number().int().min(1),
  deletionRequestedAt: z.iso.datetime().nullable(),
  purgeAfter: z.iso.datetime().nullable(),
  roleKey: RoleKeySchema,
  permissions: z.array(z.string()),
});
export type WorkspaceDetail = z.infer<typeof WorkspaceDetailSchema>;

export const MemberSummarySchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  name: z.string().nullable(),
  email: z.string(),
  roleKey: RoleKeySchema,
  joinedAt: z.iso.datetime(),
});
export type MemberSummary = z.infer<typeof MemberSummarySchema>;

export const ChangeMemberRoleRequestSchema = z.strictObject({ roleKey: AssignableRoleSchema });
export type ChangeMemberRoleRequest = z.infer<typeof ChangeMemberRoleRequestSchema>;

export const TransferOwnershipRequestSchema = z.strictObject({ memberId: z.uuid() });
export type TransferOwnershipRequest = z.infer<typeof TransferOwnershipRequestSchema>;

export const CreateInvitationRequestSchema = z.strictObject({
  email: EmailSchema,
  roleKey: AssignableRoleSchema,
});
export type CreateInvitationRequest = z.infer<typeof CreateInvitationRequestSchema>;

export const InvitationSummarySchema = z.object({
  id: z.uuid(),
  email: z.string(),
  roleKey: AssignableRoleSchema,
  status: z.enum(['PENDING', 'EXPIRED']),
  invitedByUserId: z.uuid().nullable(),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
export type InvitationSummary = z.infer<typeof InvitationSummarySchema>;

export const InvitationLookupSchema = z.object({
  workspaceName: z.string(),
  roleKey: AssignableRoleSchema,
  /** e.g. `j***@example.com`: enough to recognise, not enough to harvest. */
  emailHint: z.string(),
  expiresAt: z.iso.datetime(),
});
export type InvitationLookup = z.infer<typeof InvitationLookupSchema>;

export const ListResponse = <T extends z.ZodType>(item: T) =>
  z.object({ data: z.array(item), nextCursor: z.string().nullable() });
