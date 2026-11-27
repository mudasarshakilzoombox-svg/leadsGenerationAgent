// Copies the code catalogs (plans.ts, permissions.ts) into the `plans` and `roles` tables, which
// exist for foreign keys and history (ADR-0033). Idempotent; safe to run on every deploy.
import type { PrismaClient } from '../generated/prisma/client.js';
import { PLAN_CATALOG_VERSION, PLAN_KEYS, PlanLimitsSchema, PLANS } from './billing/plans.js';
import { ROLE_KEYS, ROLES } from './tenancy/permissions.js';

export async function syncCatalogs(
  prisma: PrismaClient,
): Promise<{ plans: number; roles: number }> {
  for (const key of PLAN_KEYS) {
    const plan = PLANS[key];
    const data = {
      name: plan.name,
      catalogVersion: PLAN_CATALOG_VERSION,
      priceMonthlyCents: plan.prices?.monthly ?? null,
      priceAnnualPerMonthCents: plan.prices?.annualPerMonth ?? null,
      limits: PlanLimitsSchema.parse(plan.limits),
      isPublic: plan.isPublic,
      isActive: true,
      sortOrder: plan.sortOrder,
    };
    await prisma.plan.upsert({ where: { key }, create: { key, ...data }, update: data });
  }
  for (const key of ROLE_KEYS) {
    const role = ROLES[key];
    const data = {
      name: role.name,
      description: role.description,
      permissions: [...role.permissions],
      isSystem: true,
      sortOrder: role.sortOrder,
    };
    await prisma.role.upsert({ where: { key }, create: { key, ...data }, update: data });
  }
  return { plans: PLAN_KEYS.length, roles: ROLE_KEYS.length };
}
