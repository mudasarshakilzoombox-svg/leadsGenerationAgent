// Plan catalog: the single source of truth for plans, limits, prices and credit costs
// (PRD §8, docs/architecture/10-billing.md §2). The `plans` table is a synced copy for foreign
// keys and history (ADR-0033). Never hard-code these values in modules or UI.
import { z } from 'zod';

/** Bump when limits or prices change. Existing subscribers keep their limits (explicit grandfathering). */
export const PLAN_CATALOG_VERSION = 1;

export const PLAN_KEYS = ['trial', 'starter', 'growth', 'agency'] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export const AUTONOMY_LEVELS = ['L0', 'L1', 'L2', 'L3'] as const;
export type AutonomyLevelKey = (typeof AUTONOMY_LEVELS)[number];

/** `null` means unlimited. Stored in `plans.limits`. */
export const PlanLimitsSchema = z.strictObject({
  seats: z.int().positive(),
  businessProfiles: z.int().positive(),
  mailboxes: z.int().positive(),
  emailsPerMonth: z.int().positive().nullable(),
  /** Lifetime cap (trial only). */
  emailsTotal: z.int().positive().nullable(),
  /** Workspace-wide daily cap (trial abuse control). Per-mailbox caps are separate. */
  emailsPerDay: z.int().positive().nullable(),
  monthlyCredits: z.int().nonnegative(),
  /** One-time grant at signup (trial only). */
  trialCredits: z.int().nonnegative(),
  contactsStored: z.int().positive(),
  activeCampaigns: z.int().positive().nullable(),
  autonomy: z.array(z.enum(AUTONOMY_LEVELS)).min(1),
});
export type PlanLimits = z.infer<typeof PlanLimitsSchema>;

export interface PlanDefinition {
  name: string;
  limits: PlanLimits;
  /** Cents. `null` for the free trial. */
  prices: { monthly: number; annualPerMonth: number } | null;
  /** Cents per month. `null` when add-ons cannot be bought. */
  addOns: { seat: number; mailbox: number } | null;
  trialDays?: number;
  isPublic: boolean;
  sortOrder: number;
}

export const PLANS = {
  trial: {
    name: 'Trial',
    limits: {
      seats: 2,
      businessProfiles: 1,
      mailboxes: 1,
      emailsPerMonth: null,
      emailsTotal: 100,
      emailsPerDay: 25,
      monthlyCredits: 0,
      trialCredits: 150,
      contactsStored: 1_000,
      activeCampaigns: 1,
      autonomy: ['L0', 'L1'],
    },
    prices: null,
    addOns: null,
    trialDays: 14,
    isPublic: true,
    sortOrder: 0,
  },
  starter: {
    name: 'Starter',
    limits: {
      seats: 2,
      businessProfiles: 1,
      mailboxes: 3,
      emailsPerMonth: 3_000,
      emailsTotal: null,
      emailsPerDay: null,
      monthlyCredits: 2_000,
      trialCredits: 0,
      contactsStored: 10_000,
      activeCampaigns: 5,
      autonomy: ['L0', 'L1'],
    },
    prices: { monthly: 4_900, annualPerMonth: 3_900 },
    addOns: { seat: 1_500, mailbox: 500 },
    isPublic: true,
    sortOrder: 1,
  },
  growth: {
    name: 'Growth',
    limits: {
      seats: 5,
      businessProfiles: 3,
      mailboxes: 10,
      emailsPerMonth: 15_000,
      emailsTotal: null,
      emailsPerDay: null,
      monthlyCredits: 8_000,
      trialCredits: 0,
      contactsStored: 50_000,
      activeCampaigns: null,
      autonomy: ['L0', 'L1', 'L2'],
    },
    prices: { monthly: 12_900, annualPerMonth: 10_300 },
    addOns: { seat: 1_500, mailbox: 500 },
    isPublic: true,
    sortOrder: 2,
  },
  agency: {
    name: 'Agency',
    limits: {
      seats: 15,
      businessProfiles: 15,
      mailboxes: 40,
      emailsPerMonth: 60_000,
      emailsTotal: null,
      emailsPerDay: null,
      monthlyCredits: 25_000,
      trialCredits: 0,
      contactsStored: 250_000,
      activeCampaigns: null,
      autonomy: ['L0', 'L1', 'L2'],
    },
    prices: { monthly: 29_900, annualPerMonth: 23_900 },
    addOns: { seat: 1_000, mailbox: 400 },
    isPublic: true,
    sortOrder: 3,
  },
} as const satisfies Record<PlanKey, PlanDefinition>;

/** One-time credit packs, valid 12 months (PRD §8.5). Prices in cents. */
export const CREDIT_PACKS = {
  pack_1k: { credits: 1_000, price: 1_500 },
  pack_5k: { credits: 5_000, price: 6_000 },
  pack_20k: { credits: 20_000, price: 20_000 },
  pack_100k: { credits: 100_000, price: 80_000 },
} as const;
export const CREDIT_PACK_VALIDITY_MONTHS = 12;

/** 1 credit = 1,000 millicredits. */
export const MILLICREDITS_PER_CREDIT = 1_000;

/**
 * Credit costs in millicredits (PRD §8.4). Free allowances (first website analysis per profile,
 * first 3 ICP generations per profile, 60-day verification reuse) are applied by the billing module.
 * Reply classification, unsubscribe, bounce processing, DNS checks and analytics are always free.
 */
export const CREDIT_COSTS_MILLI = {
  VERIFICATION: 1_000,
  AI_DRAFT: 1_000,
  AI_REPLY: 1_000,
  RESEARCH: 2_000,
  WEBSITE_ANALYSIS: 20_000,
  ICP_GENERATION: 5_000,
  SCORE_ADJUST: 200,
} as const;
export type CreditAction = keyof typeof CREDIT_COSTS_MILLI;

/** Per-mailbox daily send limits (PRD §8.3): above the soft limit needs acknowledgement. */
export const MAILBOX_DAILY_LIMIT = { default: 30, softMax: 50, hardMax: 100 } as const;

export function isPlanKey(value: string): value is PlanKey {
  return (PLAN_KEYS as readonly string[]).includes(value);
}

export function getPlan(key: PlanKey): PlanDefinition {
  return PLANS[key];
}
