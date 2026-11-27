import { describe, expect, it } from 'vitest';
import {
  allowedModels,
  assertPriced,
  costMicros,
  loadAiConfig,
  parsePricing,
  parseRouting,
  routedProviders,
} from './config.js';
import { registeredPrompts } from './prompts/registry.js';
import { AI_TASKS } from './tasks.js';

const routing = {
  version: 1,
  tiers: {
    fast: [{ provider: 'anthropic', model: 'claude-haiku-5-5' }],
    standard: [
      { provider: 'anthropic', model: 'claude-sonnet-5-5', serverFallback: true },
      { provider: 'openai', model: 'gpt-x' },
    ],
    advanced: [{ provider: 'anthropic', model: 'claude-opus-5-5' }],
  },
};

describe('AI config', () => {
  it('loads and cross-checks the bundled routing and pricing files', () => {
    const config = loadAiConfig({});
    expect(config.routing.tiers.fast[0]).toMatchObject({
      provider: 'anthropic',
      model: 'claude-haiku-5-5',
    });
    // Every routed model is priced (no unmetered calls).
    for (const model of allowedModels(config.routing))
      expect(config.pricing.models[model]).toBeDefined();
    // Every catalog task has a registered prompt at its configured version.
    for (const task of Object.keys(AI_TASKS)) {
      const version = config.routing.tasks[task]?.promptVersion ?? 1;
      expect(registeredPrompts()).toContain(`${task}@${version}`);
    }
  });

  it('applies defaults and lists routed providers and allowlisted models', () => {
    const parsed = parseRouting(routing);
    expect(parsed.tiers.fast[0]).toMatchObject({ rpm: 60, serverFallback: false });
    expect([...routedProviders(parsed)].sort()).toEqual(['anthropic', 'openai']);
    expect(allowedModels(parsed).has('gpt-x')).toBe(true);
  });

  it.each([
    [{ ...routing, tiers: { ...routing.tiers, fast: [] } }, 'tiers.fast'],
    [
      { ...routing, tiers: { ...routing.tiers, fast: [{ provider: 'mistral', model: 'm' }] } },
      'provider',
    ],
    [
      {
        ...routing,
        tiers: { ...routing.tiers, fast: [{ provider: 'anthropic', model: 'm', temperature: 1 }] },
      },
      'temperature',
    ],
    [{ ...routing, extra: true }, 'extra'],
    [{ ...routing, tasks: { 'Bad Key': {} } }, 'tasks'],
  ])('rejects invalid routing (%#)', (value, mention) => {
    expect(() => parseRouting(value)).toThrow(new RegExp(mention));
  });

  it('refuses to route a model without a price', () => {
    const pricing = parsePricing({
      version: 1,
      models: { 'claude-haiku-5-5': { input: 0.1, cachedInput: 0.01, output: 0.5 } },
    });
    expect(() => assertPriced(parseRouting(routing), pricing)).toThrow(
      /no price for routed model claude-sonnet-5-5/,
    );
  });

  it('computes cost in micro-dollars with cached input at its own price (05 §10)', () => {
    const price = { input: 2, cachedInput: 0.1, output: 10 };
    // 1,000 input of which 400 cached, 500 output:
    // 600 * 2 + 400 * 0.1 + 500 * 10 = 1200 + 40 + 5000 = 6240 micro-dollars ($0.00624).
    expect(
      costMicros(price, { inputTokens: 1000, cachedInputTokens: 400, outputTokens: 500 }),
    ).toBe(6240n);
    expect(costMicros(undefined, { inputTokens: 10, cachedInputTokens: 0, outputTokens: 10 })).toBe(
      0n,
    );
    expect(costMicros(price, { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 })).toBe(0n);
  });
});
