// Read-only dashboard contracts (ADR-0035). The API returns these and the web parses them.
import { z } from 'zod';
import { METRIC_KEYS, RangeKeySchema } from './metrics.js';

const id = z.uuid();
const iso = z.iso.datetime();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** `{ data, nextCursor }` collections (03-api.md §3). */
export const Page = <T extends z.ZodType>(item: T) =>
  z.object({ data: z.array(item), nextCursor: z.string().nullable() });

/** Common list query (03-api.md §5): limit 1-100, signed cursor, search up to 100 chars. */
export const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).max(512).optional(),
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type ListQuery = z.infer<typeof ListQuerySchema>;

export const TIERS = ['A', 'B', 'C', 'D'] as const;
export const TierSchema = z.enum(TIERS);
export const LEAD_STAGES = [
  'NEW',
  'QUALIFIED',
  'ENROLLED',
  'CONTACTED',
  'REPLIED',
  'INTERESTED',
  'MEETING_BOOKED',
  'WON',
  'LOST',
  'DISQUALIFIED',
] as const;
export const EMAIL_STATUSES = [
  'UNVERIFIED',
  'NOT_FOUND',
  'VALID',
  'CATCH_ALL',
  'UNKNOWN',
  'INVALID',
  'DISPOSABLE',
  'ROLE',
] as const;
export const CAMPAIGN_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'SCHEDULED',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'ARCHIVED',
] as const;

// ------------------------------------------------------------------------------ overview

export const RangeQuerySchema = z.object({ range: RangeKeySchema });

/**
 * Dashboard filters (ADR-0036). `project` is a business profile id and `campaign` a campaign id;
 * the API re-checks both inside the tenant and answers 404 for anything else.
 */
export const OverviewQuerySchema = RangeQuerySchema.extend({
  project: id.optional(),
  campaign: id.optional(),
});
export type OverviewQuery = z.infer<typeof OverviewQuerySchema>;

export const PERFORMANCE_KEYS = ['sent', 'delivered', 'hotLeads', 'creditsUsed'] as const;
export type PerformanceKey = (typeof PERFORMANCE_KEYS)[number];

/** One dashboard performance card: total, previous period, change and a daily series. */
export const PerformanceMetricSchema = z.object({
  key: z.enum(PERFORMANCE_KEYS),
  label: z.string(),
  format: z.enum(['count', 'credits']),
  higherIsBetter: z.boolean(),
  /** `workspace` when the metric cannot be narrowed to the selected project or campaign. */
  scope: z.enum(['filtered', 'workspace']),
  value: z.number().nullable(),
  previous: z.number().nullable(),
  change: z.number().nullable(),
  series: z.array(z.object({ date: day, value: z.number() })),
});
export type PerformanceMetric = z.infer<typeof PerformanceMetricSchema>;

export const KpiSchema = z.object({
  key: z.enum(METRIC_KEYS),
  label: z.string(),
  format: z.enum(['count', 'percent']),
  higherIsBetter: z.boolean(),
  value: z.number().nullable(),
  previous: z.number().nullable(),
  change: z.number().nullable(),
});
export type Kpi = z.infer<typeof KpiSchema>;

export const SeriesPointSchema = z.object({
  date: day,
  sent: z.number().int(),
  replies: z.number().int(),
});
export type SeriesPoint = z.infer<typeof SeriesPointSchema>;

export const OverviewSchema = z.object({
  range: RangeKeySchema,
  from: iso,
  to: iso,
  timezone: z.string(),
  kpis: z.array(KpiSchema),
  newLeadsByTier: z.object({
    A: z.number().int(),
    B: z.number().int(),
    C: z.number().int(),
    D: z.number().int(),
  }),
  series: z.array(SeriesPointSchema),
  attention: z.object({
    unreadReplies: z.number().int(),
    draftsToReview: z.number().int(),
    pendingApprovals: z.number().int(),
    mailboxIssues: z.number().int(),
  }),
  checklist: z.array(
    z.object({ key: z.string(), label: z.string(), done: z.boolean(), href: z.string() }),
  ),
  /** Applied filters, echoed back (null = all). */
  projectId: id.nullable(),
  campaignId: id.nullable(),
  performance: z.array(PerformanceMetricSchema),
});
export type Overview = z.infer<typeof OverviewSchema>;

// ------------------------------------------------------------------------------ projects

/** A project is a business profile (one website) with its campaigns (ADR-0036). */
export const ProjectSchema = z.object({
  id,
  name: z.string(),
  domain: z.string(),
  status: z.string(),
  campaigns: z.array(z.object({ id, name: z.string(), status: z.enum(CAMPAIGN_STATUSES) })),
});
export type Project = z.infer<typeof ProjectSchema>;
export const ProjectsSchema = z.object({
  data: z.array(ProjectSchema),
  /** Workspace-wide unread inbox threads, for the sidebar badge. */
  unreadReplies: z.number().int(),
});
export type Projects = z.infer<typeof ProjectsSchema>;

export const ProjectFilterSchema = z.object({ project: id.optional() });

export const CampaignStatsSchema = z.object({
  id,
  name: z.string(),
  status: z.enum(CAMPAIGN_STATUSES),
  sent: z.number().int(),
  replies: z.number().int(),
  positive: z.number().int(),
  meetings: z.number().int(),
  replyRate: z.number().nullable(),
  positiveReplyRate: z.number().nullable(),
  hardBounceRate: z.number().nullable(),
});

export const AnalyticsSchema = z.object({
  range: RangeKeySchema,
  from: iso,
  to: iso,
  kpis: z.array(KpiSchema),
  series: z.array(SeriesPointSchema),
  campaigns: z.array(CampaignStatsSchema),
  mailboxes: z.array(
    z.object({
      id,
      emailAddress: z.string(),
      status: z.string(),
      sent: z.number().int(),
      hardBounced: z.number().int(),
      hardBounceRate: z.number().nullable(),
      dailyLimit: z.number().int(),
    }),
  ),
  credits: z.object({
    usedByAction: z.array(z.object({ action: z.string(), credits: z.number() })),
    remaining: z.number(),
  }),
});
export type Analytics = z.infer<typeof AnalyticsSchema>;

// ------------------------------------------------------------------------------ records

const CompanyRefSchema = z.object({ id, name: z.string(), domain: z.string() });
const ContactRefSchema = z.object({
  id,
  fullName: z.string().nullable(),
  email: z.string().nullable(),
});

export const LeadQuerySchema = ListQuerySchema.extend({
  tier: TierSchema.optional(),
  stage: z.enum(LEAD_STAGES).optional(),
  icpId: id.optional(),
});
export const LeadItemSchema = z.object({
  id,
  stage: z.enum(LEAD_STAGES),
  tier: TierSchema.nullable(),
  score: z.number().int().nullable(),
  scoredAt: iso.nullable(),
  createdAt: iso,
  contact: ContactRefSchema.extend({
    title: z.string().nullable(),
    emailStatus: z.enum(EMAIL_STATUSES),
  }),
  company: CompanyRefSchema.nullable(),
  icp: z.object({ id, name: z.string() }),
});
export type LeadItem = z.infer<typeof LeadItemSchema>;

export const ProvenanceSchema = z.object({
  field: z.string(),
  provider: z.string(),
  sourceType: z.string(),
  lawfulBasis: z.string(),
  retrievedAt: iso,
  observedAt: iso,
});

export const CompanyItemSchema = z.object({
  id,
  name: z.string(),
  domain: z.string(),
  industry: z.string().nullable(),
  employeeRange: z.string().nullable(),
  hqCountry: z.string().nullable(),
  status: z.string(),
  contactsCount: z.number().int(),
  createdAt: iso,
});
export type CompanyItem = z.infer<typeof CompanyItemSchema>;

export const ContactItemSchema = z.object({
  id,
  fullName: z.string().nullable(),
  title: z.string().nullable(),
  seniority: z.string(),
  email: z.string().nullable(),
  emailStatus: z.enum(EMAIL_STATUSES),
  country: z.string().nullable(),
  status: z.string(),
  company: z.object({ id, name: z.string() }).nullable(),
  createdAt: iso,
});
export type ContactItem = z.infer<typeof ContactItemSchema>;
export const ContactQuerySchema = ListQuerySchema.extend({
  emailStatus: z.enum(EMAIL_STATUSES).optional(),
});

export const CompanyDetailSchema = CompanyItemSchema.extend({
  websiteUrl: z.string().nullable(),
  description: z.string().nullable(),
  technologies: z.array(z.string()),
  fundingStage: z.string().nullable(),
  employeeCount: z.number().int().nullable(),
  contacts: z.array(ContactItemSchema),
  provenance: z.array(ProvenanceSchema),
});
export type CompanyDetail = z.infer<typeof CompanyDetailSchema>;

export const ContactDetailSchema = ContactItemSchema.extend({
  linkedinUrl: z.string().nullable(),
  timezone: z.string().nullable(),
  lawfulBasis: z.string(),
  source: z.string(),
  leads: z.array(
    z.object({
      id,
      icpName: z.string(),
      stage: z.enum(LEAD_STAGES),
      tier: TierSchema.nullable(),
      score: z.number().int().nullable(),
      reasons: z.array(z.string()),
    }),
  ),
  provenance: z.array(ProvenanceSchema),
  activity: z.array(z.object({ id, type: z.string(), occurredAt: iso })),
});
export type ContactDetail = z.infer<typeof ContactDetailSchema>;

export const LeadListItemSchema = z.object({
  id,
  name: z.string(),
  description: z.string().nullable(),
  membersCount: z.number().int(),
  createdAt: iso,
});
export const LeadListDetailSchema = LeadListItemSchema.extend({ leads: z.array(LeadItemSchema) });
export type LeadListDetail = z.infer<typeof LeadListDetailSchema>;

export const IcpOverviewSchema = z.object({
  profiles: z.array(
    z.object({
      id,
      name: z.string(),
      domain: z.string(),
      status: z.string(),
      summary: z.string().nullable(),
      icps: z.array(
        z.object({
          id,
          name: z.string(),
          status: z.string(),
          version: z.number().int(),
          firmographics: z.record(z.string(), z.unknown()),
          painPoints: z.array(z.string()),
          rationale: z.string().nullable(),
          leadsCount: z.number().int(),
          segments: z.array(
            z.object({
              id,
              name: z.string(),
              titleKeywords: z.array(z.string()),
              seniorities: z.array(z.string()),
            }),
          ),
        }),
      ),
    }),
  ),
});
export type IcpOverview = z.infer<typeof IcpOverviewSchema>;

// ------------------------------------------------------------------------------ outreach

export const CampaignQuerySchema = ListQuerySchema.extend({
  status: z.enum(CAMPAIGN_STATUSES).optional(),
  project: id.optional(),
});
export const CampaignItemSchema = z.object({
  id,
  name: z.string(),
  status: z.enum(CAMPAIGN_STATUSES),
  autonomyLevel: z.string(),
  businessProfileName: z.string(),
  icpName: z.string(),
  recipients: z.number().int(),
  sent: z.number().int(),
  replies: z.number().int(),
  meetings: z.number().int(),
  launchedAt: iso.nullable(),
  createdAt: iso,
});
export type CampaignItem = z.infer<typeof CampaignItemSchema>;
export const CampaignDetailSchema = CampaignItemSchema.extend({
  steps: z.array(
    z.object({
      id,
      stepOrder: z.number().int(),
      intent: z.string(),
      delayDays: z.number().int(),
      threadMode: z.string(),
      sent: z.number().int(),
      replies: z.number().int(),
    }),
  ),
  recipientStatus: z.record(z.string(), z.number().int()),
  approval: z.object({ status: z.string(), decidedAt: iso.nullable() }).nullable(),
  mailboxes: z.array(z.object({ id, emailAddress: z.string() })),
});
export type CampaignDetail = z.infer<typeof CampaignDetailSchema>;

export const CONVERSATION_FILTERS = ['all', 'unread', 'interested'] as const;
export const ConversationQuerySchema = ListQuerySchema.extend({
  filter: z.enum(CONVERSATION_FILTERS).default('all'),
});
export const ConversationItemSchema = z.object({
  id,
  subject: z.string().nullable(),
  status: z.string(),
  isUnread: z.boolean(),
  lastMessageAt: iso,
  snippet: z.string().nullable(),
  category: z.string().nullable(),
  contact: ContactRefSchema.nullable(),
  mailbox: z.object({ id, emailAddress: z.string() }),
});
export type ConversationItem = z.infer<typeof ConversationItemSchema>;
export const ConversationDetailSchema = ConversationItemSchema.extend({
  messages: z.array(
    z.object({
      id,
      direction: z.enum(['OUTBOUND', 'INBOUND']),
      fromEmail: z.string(),
      toEmails: z.array(z.string()),
      subject: z.string().nullable(),
      /** Plain text only: rendered escaped, never as HTML. */
      bodyText: z.string().nullable(),
      at: iso,
    }),
  ),
  classification: z
    .object({
      category: z.string(),
      confidence: z.number(),
      sentiment: z.string().nullable(),
      summary: z.string().nullable(),
    })
    .nullable(),
});
export type ConversationDetail = z.infer<typeof ConversationDetailSchema>;

export const SentQuerySchema = ListQuerySchema.extend({
  project: id.optional(),
  campaign: id.optional(),
});
export const SentItemSchema = z.object({
  id,
  conversationId: id,
  subject: z.string().nullable(),
  toEmails: z.array(z.string()),
  contact: ContactRefSchema.nullable(),
  campaign: z.object({ id, name: z.string() }).nullable(),
  stepOrder: z.number().int().nullable(),
  mailbox: z.object({ id, emailAddress: z.string() }),
  sentAt: iso,
});
export type SentItem = z.infer<typeof SentItemSchema>;

/** Email sequences of a project's campaigns. Step bodies are not part of this read model. */
export const SequencesSchema = z.object({
  data: z.array(
    z.object({
      campaign: z.object({ id, name: z.string(), status: z.enum(CAMPAIGN_STATUSES) }),
      steps: z.array(
        z.object({
          id,
          stepOrder: z.number().int(),
          type: z.string(),
          delayDays: z.number().int(),
          intent: z.string(),
          subject: z.string().nullable(),
        }),
      ),
    }),
  ),
});
export type Sequences = z.infer<typeof SequencesSchema>;

export const MeetingQuerySchema = z.object({
  when: z.enum(['upcoming', 'past']).default('upcoming'),
});
export const MeetingItemSchema = z.object({
  id,
  status: z.string(),
  source: z.string(),
  provider: z.string(),
  startsAt: iso,
  endsAt: iso,
  timezone: z.string().nullable(),
  meetingUrl: z.string().nullable(),
  contact: ContactRefSchema.nullable(),
  campaign: z.object({ id, name: z.string() }).nullable(),
  hostName: z.string().nullable(),
});
export type MeetingItem = z.infer<typeof MeetingItemSchema>;

// ------------------------------------------------------------------------------ account

export const IntegrationsSchema = z.object({
  providers: z.array(
    z.object({
      id,
      provider: z.string(),
      category: z.string(),
      status: z.string(),
      lastUsedAt: iso.nullable(),
      lastErrorAt: iso.nullable(),
    }),
  ),
  mailboxes: z.array(
    z.object({
      id,
      emailAddress: z.string(),
      provider: z.string(),
      status: z.string(),
      statusReason: z.string().nullable(),
      dailyLimit: z.number().int(),
      lastSyncedAt: iso.nullable(),
    }),
  ),
  calendars: z.array(
    z.object({ id, provider: z.string(), status: z.string(), bookingUrl: z.string().nullable() }),
  ),
  domains: z.array(
    z.object({
      id,
      domain: z.string(),
      spf: z.string(),
      dkim: z.string(),
      dmarc: z.string(),
      mx: z.string(),
      lastCheckedAt: iso.nullable(),
    }),
  ),
});
export type Integrations = z.infer<typeof IntegrationsSchema>;

export const BillingSchema = z.object({
  plan: z.object({
    key: z.string(),
    name: z.string(),
    priceMonthlyCents: z.number().int().nullable(),
    status: z.string(),
    trialEndsAt: iso.nullable(),
  }),
  subscription: z
    .object({ status: z.string(), billingInterval: z.string(), currentPeriodEnd: iso.nullable() })
    .nullable(),
  usage: z.object({
    seats: z.object({ used: z.number().int(), limit: z.number().int() }),
    contacts: z.object({ used: z.number().int(), limit: z.number().int() }),
    emails: z.object({
      used: z.number().int(),
      limit: z.number().int().nullable(),
      period: z.string(),
    }),
    credits: z.object({ remaining: z.number(), monthlyIncluded: z.number() }),
  }),
  catalog: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      priceMonthlyCents: z.number().int().nullable(),
      priceAnnualPerMonthCents: z.number().int().nullable(),
      seats: z.number().int(),
      mailboxes: z.number().int(),
      emailsPerMonth: z.number().int().nullable(),
      monthlyCredits: z.number().int(),
      contactsStored: z.number().int(),
    }),
  ),
});
export type Billing = z.infer<typeof BillingSchema>;
