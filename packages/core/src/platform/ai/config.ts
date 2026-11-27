import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { AI_PROVIDERS, AI_TIERS, type AiProviderName, type AiTier } from './types.js';

/**
 * AI routing and pricing config (05-ai-orchestration §7 and §10). Loaded once at boot and
 * validated strictly: a typo fails the process instead of silently routing elsewhere.
 */

/** packages/core/config, from both src/platform/ai and dist/platform/ai. */
export const AI_CONFIG_DIR = path.resolve(import.meta.dirname, '../../../config');

const routeSchema = z.strictObject({
  provider: z.enum(AI_PROVIDERS),
  model: z.string().min(1).max(100),
  /** Requests per minute for this (provider, model), shared across processes via Valkey. */
  rpm: z.number().int().min(1).max(100_000).default(60),
  /** Anthropic server-side refusal fallback (beta). */
  serverFallback: z.boolean().default(false),
});
export type AiRoute = z.output<typeof routeSchema>;

const routingSchema = z.strictObject({
  version: z.literal(1),
  tiers: z.strictObject(
    Object.fromEntries(AI_TIERS.map((t) => [t, z.array(routeSchema).min(1).max(4)])) as Record<
      AiTier,
      z.ZodArray<typeof routeSchema>
    >,
  ),
  tasks: z
    .record(
      z.string().regex(/^[a-z]+\.[a-z-]+$/),
      z.strictObject({
        promptVersion: z.number().int().min(1).default(1),
        disabled: z.boolean().default(false),
        tier: z.enum(AI_TIERS).optional(),
      }),
    )
    .default({}),
});
export type AiRouting = z.output<typeof routingSchema>;

const priceSchema = z.strictObject({
  input: z.number().min(0),
  cachedInput: z.number().min(0),
  output: z.number().min(0),
});
const pricingSchema = z.strictObject({
  version: z.literal(1),
  models: z.record(z.string().min(1), priceSchema),
});
export type AiPricing = z.output<typeof pricingSchema>;
export type ModelPrice = z.output<typeof priceSchema>;

function readYaml(file: string, what: string): unknown {
  try {
    return parseYaml(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${what}: cannot read ${file}: ${(error as Error).message}`);
  }
}

function validate<S extends z.ZodType>(schema: S, value: unknown, what: string): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`${what} is invalid: ${issues.join('; ')}`);
  }
  return parsed.data;
}

export function parseRouting(value: unknown): AiRouting {
  return validate(routingSchema, value, 'AI routing config');
}

export function parsePricing(value: unknown): AiPricing {
  return validate(pricingSchema, value, 'AI pricing config');
}

export interface AiConfig {
  routing: AiRouting;
  pricing: AiPricing;
}

/**
 * Load and cross-check both files: every routed model must have a price (no unmetered calls),
 * and the fake provider is only allowed when integrations are fake.
 */
export function loadAiConfig(options: {
  routingFile?: string | undefined;
  pricingFile?: string | undefined;
}): AiConfig {
  const routing = parseRouting(
    readYaml(options.routingFile ?? path.join(AI_CONFIG_DIR, 'ai-routing.yaml'), 'AI routing'),
  );
  const pricing = parsePricing(
    readYaml(options.pricingFile ?? path.join(AI_CONFIG_DIR, 'ai-pricing.yaml'), 'AI pricing'),
  );
  assertPriced(routing, pricing);
  return { routing, pricing };
}

export function assertPriced(routing: AiRouting, pricing: AiPricing): void {
  for (const routes of Object.values(routing.tiers)) {
    for (const route of routes) {
      if (route.provider !== 'fake' && !pricing.models[route.model]) {
        throw new Error(`AI pricing config has no price for routed model ${route.model}`);
      }
    }
  }
}

/** Providers named anywhere in the routing (their API keys are required in real mode). */
export function routedProviders(routing: AiRouting): Set<AiProviderName> {
  return new Set(Object.values(routing.tiers).flatMap((routes) => routes.map((r) => r.provider)));
}

/** All allowlisted models (AIC-CALL-04). */
export function allowedModels(routing: AiRouting): Set<string> {
  return new Set(Object.values(routing.tiers).flatMap((routes) => routes.map((r) => r.model)));
}

/** cost_micros = USD cost * 1e6, from per-million-token prices (05 §10). Never negative. */
export function costMicros(
  price: ModelPrice | undefined,
  usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number },
): bigint {
  if (!price) return 0n;
  const uncached = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  // Prices are USD per 1M tokens, so USD per token * 1e6 micros = price per token in micros.
  const micros =
    uncached * price.input +
    usage.cachedInputTokens * price.cachedInput +
    usage.outputTokens * price.output;
  return BigInt(Math.max(0, Math.round(micros)));
}
