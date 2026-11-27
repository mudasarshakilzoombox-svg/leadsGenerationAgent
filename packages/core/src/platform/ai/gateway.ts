import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import type { RateLimiter } from '../rate-limit/rate-limiter.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { type AiConfig, type AiRoute, costMicros } from './config.js';
import { type LlmProvider, type LlmUsage, LlmError } from './providers/provider.js';
import type { AiTaskSpec, PromptModule } from './tasks.js';
import type { AiProviderName, AiRunStatus } from './types.js';

/**
 * AiGateway (05-ai-orchestration §2, §7, §8): the only path to LLM providers. Resolves the route
 * for the task's tier, applies the shared per-model rate limit and the circuit breaker, calls the
 * provider, validates the JSON output against the prompt's strict schema with one repair attempt,
 * and falls back to the next provider only for availability failures (never for invalid output or
 * refusals). Domain code calls AiActionPipeline, which wraps this with the AIC checks.
 */

/** Wait at most this long on a 429 before trying the next provider (05 §7). */
export const MAX_RETRY_AFTER_SECONDS = 20;

export interface GatewayRequest<Out> {
  spec: AiTaskSpec;
  prompt: PromptModule<unknown, Out>;
  /** Final user blocks (already sanitized and fitted to the budget). */
  blocks: Array<{ text: string; cache?: boolean }>;
  /** Deterministic output for the fake provider. */
  fakeOutput?: unknown;
  signal?: AbortSignal;
}

export interface GatewayResult<Out> {
  status: AiRunStatus;
  output?: Out;
  /** Raw validated JSON text (for output checks). */
  text?: string;
  provider: AiProviderName;
  model: string;
  usage: LlmUsage;
  costMicros: bigint;
  latencyMs: number;
  attempt: number;
  errorCode?: string;
  /** Schema issue paths when the output was invalid (no values). */
  issues?: string[];
}

export type ProviderMap = Partial<Record<AiProviderName, LlmProvider>>;

const ZERO: LlmUsage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };

function addUsage(a: LlmUsage, b: LlmUsage): LlmUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}

function parseOutput<Out>(
  schema: z.ZodType<Out>,
  text: string,
): { ok: true; value: Out } | { ok: false; issues: string[] } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, issues: ['(root): not valid JSON'] };
  }
  const parsed = schema.safeParse(json);
  if (parsed.success) return { ok: true, value: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.code}`)
      .slice(0, 10),
  };
}

export class AiGateway {
  private readonly breaker: CircuitBreaker;

  constructor(
    private readonly config: AiConfig,
    private readonly providers: ProviderMap,
    private readonly rateLimiter: Pick<RateLimiter, 'hit'> | null,
    options: { breaker?: CircuitBreaker; fakeMode?: boolean } = {},
  ) {
    this.breaker = options.breaker ?? new CircuitBreaker();
    this.fakeMode = options.fakeMode ?? false;
  }

  private readonly fakeMode: boolean;

  /** Routes for a task: the tier from routing overrides or the task catalog. */
  routes(spec: AiTaskSpec): AiRoute[] {
    const tier = this.config.routing.tasks[spec.key]?.tier ?? spec.tier;
    return this.config.routing.tiers[tier];
  }

  private provider(route: AiRoute): LlmProvider | undefined {
    return this.fakeMode ? this.providers.fake : this.providers[route.provider];
  }

  async run<Out>(request: GatewayRequest<Out>): Promise<GatewayResult<Out>> {
    const started = Date.now();
    const jsonSchema = z.toJSONSchema(request.prompt.outputSchema as z.ZodType) as Record<
      string,
      unknown
    >;
    let usage = ZERO;
    let attempt = 0;
    let last:
      | { provider: AiProviderName; model: string; status: AiRunStatus; errorCode: string }
      | undefined;

    for (const route of this.routes(request.spec)) {
      const provider = this.provider(route);
      const providerName: AiProviderName = this.fakeMode ? 'fake' : route.provider;
      const key = `${providerName}:${route.model}`;
      if (!provider) {
        last = {
          provider: providerName,
          model: route.model,
          status: 'PROVIDER_ERROR',
          errorCode: 'PROVIDER_NOT_CONFIGURED',
        };
        continue;
      }
      if (!this.breaker.allow(key)) {
        last = {
          provider: providerName,
          model: route.model,
          status: 'PROVIDER_ERROR',
          errorCode: 'CIRCUIT_OPEN',
        };
        continue;
      }

      const base = {
        task: request.spec.key,
        model: route.model,
        system: request.prompt.system,
        jsonSchema,
        fakeOutput: request.fakeOutput,
        maxOutputTokens: request.spec.maxOutputTokens,
        timeoutMs: request.spec.timeoutMs,
        serverFallback: route.serverFallback,
        ...(request.signal ? { signal: request.signal } : {}),
      };

      // One same-provider retry when the provider asks us to wait briefly (429 + Retry-After).
      for (let sameProviderTry = 0; sameProviderTry < 2; sameProviderTry += 1) {
        const limited = await this.rateLimited(route);
        if (limited !== null) {
          if (limited <= MAX_RETRY_AFTER_SECONDS && sameProviderTry === 0) {
            await sleep(limited * 1000);
            continue;
          }
          last = {
            provider: providerName,
            model: route.model,
            status: 'PROVIDER_ERROR',
            errorCode: 'RATE_LIMITED',
          };
          break;
        }
        attempt += 1;
        try {
          const first = await provider.complete({
            ...base,
            blocks: request.blocks,
            effort: request.spec.effort,
            temperature: request.spec.temperature,
          });
          usage = addUsage(usage, first.usage);
          this.breaker.success(key);
          const finish = (
            status: AiRunStatus,
            extra: Partial<GatewayResult<Out>> = {},
          ): GatewayResult<Out> => ({
            status,
            provider: providerName,
            model: first.model,
            usage,
            costMicros: costMicros(this.price(providerName, first.model), usage),
            latencyMs: Date.now() - started,
            attempt,
            ...extra,
          });
          if (first.stopReason === 'refusal')
            return finish('MODEL_REFUSED', { errorCode: 'MODEL_REFUSED' });

          let parsed = parseOutput(request.prompt.outputSchema, first.text);
          let text = first.text;
          if (!parsed.ok) {
            // Single repair call: same route, lowest effort, the issue list (05 §8, AIC-OUT-01).
            attempt += 1;
            const repair = await provider.complete({
              ...base,
              blocks: [
                ...request.blocks,
                {
                  text: [
                    'Your previous answer did not match the required JSON schema.',
                    `Problems: ${parsed.issues.join('; ')}`,
                    'Previous answer:',
                    first.text.slice(0, 4_000),
                    'Return only corrected JSON that matches the schema.',
                  ].join('\n'),
                },
              ],
              effort: 'low',
              temperature: 0,
            });
            usage = addUsage(usage, repair.usage);
            if (repair.stopReason === 'refusal')
              return finish('MODEL_REFUSED', { errorCode: 'MODEL_REFUSED' });
            parsed = parseOutput(request.prompt.outputSchema, repair.text);
            text = repair.text;
            if (!parsed.ok) {
              return {
                ...finish('INVALID_OUTPUT', { errorCode: 'INVALID_OUTPUT', issues: parsed.issues }),
                costMicros: costMicros(this.price(providerName, repair.model), usage),
              };
            }
          }
          return finish('SUCCESS', { output: parsed.value, text });
        } catch (error) {
          const err =
            error instanceof LlmError ? error : new LlmError('UNAVAILABLE', 'provider call failed');
          if (
            err.kind === 'RATE_LIMITED' &&
            sameProviderTry === 0 &&
            (err.retryAfterSeconds ?? Infinity) <= MAX_RETRY_AFTER_SECONDS
          ) {
            await sleep((err.retryAfterSeconds ?? 0) * 1000);
            continue;
          }
          // Our own bad request or credentials: falling back would not help and hides the bug.
          if (err.kind !== 'BAD_REQUEST' && err.kind !== 'AUTH') this.breaker.failure(key);
          last = {
            provider: providerName,
            model: route.model,
            status: err.kind === 'TIMEOUT' ? 'TIMEOUT' : 'PROVIDER_ERROR',
            errorCode: err.kind,
          };
          if (err.kind === 'BAD_REQUEST' || err.kind === 'AUTH') {
            return { ...last, usage, costMicros: 0n, latencyMs: Date.now() - started, attempt };
          }
          break;
        }
      }
    }

    const fallback = last ?? {
      provider: 'fake' as const,
      model: 'none',
      status: 'PROVIDER_ERROR' as const,
      errorCode: 'NO_ROUTE',
    };
    return {
      ...fallback,
      usage,
      costMicros: costMicros(this.price(fallback.provider, fallback.model), usage),
      latencyMs: Date.now() - started,
      attempt,
    };
  }

  private price(provider: AiProviderName, model: string) {
    return this.config.pricing.models[provider === 'fake' ? 'fake-model' : model];
  }

  /** Shared per-(provider, model) requests-per-minute budget. Returns seconds to wait, or null. */
  private async rateLimited(route: AiRoute): Promise<number | null> {
    if (!this.rateLimiter || this.fakeMode) return null;
    const result = await this.rateLimiter.hit(
      { scope: `ai:${route.provider}:${route.model}`, limit: route.rpm, windowSeconds: 60 },
      'all',
    );
    return result.allowed ? null : result.retryAfterSeconds;
  }
}
