import { type DynamicModule, Module } from '@nestjs/common';
import { APP_CONFIG } from '../../config/config.module.js';
import type { BaseServerEnv } from '../../config/env.js';
import { RateLimiter } from '../rate-limit/rate-limiter.js';
import { AiRunRecorder } from './ai-run-recorder.js';
import { type AiConfig, loadAiConfig, routedProviders } from './config.js';
import { AiGateway, type ProviderMap } from './gateway.js';
import { AiActionPipeline } from './pipeline.js';
import { AnthropicProvider } from './providers/anthropic.adapter.js';
import { FakeProvider } from './providers/fake.adapter.js';
import { OpenAiProvider } from './providers/openai.adapter.js';

export const AI_CONFIG = Symbol.for('lga.AiConfig');
export const LLM_PROVIDERS = Symbol.for('lga.LlmProviders');

/**
 * Builds the provider map for the current mode. Fake mode: only the deterministic fake (no
 * network, no keys). Real mode: every provider the routing config names must have its key, or
 * the process refuses to start (no silent fallback to a missing provider).
 */
export function buildProviders(env: BaseServerEnv, config: AiConfig): ProviderMap {
  if (env.INTEGRATIONS_MODE === 'fake') return { fake: new FakeProvider() };
  const providers: ProviderMap = {};
  for (const name of routedProviders(config.routing)) {
    if (name === 'anthropic') {
      if (!env.ANTHROPIC_API_KEY)
        throw new Error('ANTHROPIC_API_KEY is required: the AI routing config uses anthropic');
      providers.anthropic = new AnthropicProvider(env.ANTHROPIC_API_KEY);
    } else if (name === 'openai') {
      if (!env.OPENAI_API_KEY)
        throw new Error('OPENAI_API_KEY is required: the AI routing config uses openai');
      providers.openai = new OpenAiProvider(env.OPENAI_API_KEY);
    } else {
      throw new Error('The fake AI provider cannot be routed when INTEGRATIONS_MODE=real');
    }
  }
  return providers;
}

/** AiGateway + AiActionPipeline (05-ai-orchestration §2). Requires PlatformServicesModule. */
@Module({})
export class AiModule {
  static forRoot(): DynamicModule {
    const providers = [
      AiRunRecorder,
      {
        provide: AI_CONFIG,
        inject: [APP_CONFIG],
        useFactory: (env: BaseServerEnv) =>
          loadAiConfig({ routingFile: env.AI_ROUTING_FILE, pricingFile: env.AI_PRICING_FILE }),
      },
      {
        provide: LLM_PROVIDERS,
        inject: [APP_CONFIG, AI_CONFIG],
        useFactory: buildProviders,
      },
      {
        provide: AiGateway,
        inject: [APP_CONFIG, AI_CONFIG, LLM_PROVIDERS, RateLimiter],
        useFactory: (
          env: BaseServerEnv,
          config: AiConfig,
          map: ProviderMap,
          limiter: RateLimiter,
        ) => new AiGateway(config, map, limiter, { fakeMode: env.INTEGRATIONS_MODE === 'fake' }),
      },
      {
        provide: AiActionPipeline,
        inject: [APP_CONFIG, AI_CONFIG, AiGateway, AiRunRecorder, RateLimiter],
        useFactory: (
          env: BaseServerEnv,
          config: AiConfig,
          gateway: AiGateway,
          recorder: AiRunRecorder,
          limiter: RateLimiter,
        ) =>
          new AiActionPipeline(config, gateway, recorder, {
            globalDisabled: env.AI_DISABLED,
            rateLimiter: limiter,
          }),
      },
    ];
    return { module: AiModule, providers, exports: providers };
  }
}
