import { z } from 'zod';
import { DisplayNameSchema, EmailSchema, RoleKeySchema } from './auth.js';

/** Roles that can be granted through invitations and role changes. OWNER only via transfer. */
export const ASSIGNABLE_ROLE_VALUES = ['ADMIN', 'MEMBER', 'READ_ONLY'] as const;
export const AssignableRoleSchema = z.enum(ASSIGNABLE_ROLE_VALUES);
export type AssignableRole = z.infer<typeof AssignableRoleSchema>;

const TimezoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine(
    (tz) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Unknown time zone.' },
  );

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
