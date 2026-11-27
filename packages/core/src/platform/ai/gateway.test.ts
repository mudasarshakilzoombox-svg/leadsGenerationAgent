import { describe, expect, it } from 'vitest';
import { CircuitBreaker } from './circuit-breaker.js';
import { type AiConfig, parsePricing, parseRouting } from './config.js';
import { AiGateway } from './gateway.js';
import { systemSelftestV1 } from './prompts/system-selftest/v1.js';
import { AnthropicProvider } from './providers/anthropic.adapter.js';
import { FakeProvider } from './providers/fake.adapter.js';
import { OpenAiProvider } from './providers/openai.adapter.js';
import { LlmError, type LlmRequest } from './providers/provider.js';
import { AI_TASKS } from './tasks.js';

const config: AiConfig = {
  routing: parseRouting({
    version: 1,
    tiers: {
      fast: [
        { provider: 'anthropic', model: 'model-a' },
        { provider: 'openai', model: 'model-b' },
      ],
      standard: [{ provider: 'anthropic', model: 'model-a' }],
      advanced: [{ provider: 'anthropic', model: 'model-a' }],
    },
  }),
  pricing: parsePricing({
    version: 1,
    models: {
      'model-a': { input: 1, cachedInput: 0.1, output: 5 },
      'model-b': { input: 2, cachedInput: 0.2, output: 8 },
      'fake-model': { input: 0, cachedInput: 0, output: 0 },
    },
  }),
};

const vars = { code: 'ABC123', a: 2, b: 3 };
const good = JSON.stringify({ status: 'ok', echo: 'ABC123', sum: 5 });
const spec = AI_TASKS['system.selftest'];

function setup(breaker = new CircuitBreaker()) {
  const primary = new FakeProvider();
  const secondary = new FakeProvider();
  const gateway = new AiGateway(config, { anthropic: primary, openai: secondary }, null, {
    breaker,
  });
  const run = () =>
    gateway.run({
      spec,
      prompt: systemSelftestV1,
      blocks: systemSelftestV1.buildUser(vars),
      fakeOutput: systemSelftestV1.fakeOutput(vars),
    });
  return { primary, secondary, run };
}

describe('AiGateway', () => {
  it('returns validated output with usage and cost from the answering model', async () => {
    const { primary, run } = setup();
    primary.script('system.selftest', { text: good });
    const result = await run();
    expect(result).toMatchObject({
      status: 'SUCCESS',
      output: { echo: 'ABC123', sum: 5 },
      provider: 'anthropic',
      model: 'model-a',
      attempt: 1,
    });
    expect(result.costMicros).toBeGreaterThan(0n);
    // The request carries the schema, the effort and the static system prompt.
    expect(primary.calls[0]).toMatchObject({
      effort: 'low',
      system: systemSelftestV1.system,
      maxOutputTokens: 200,
    });
    expect(primary.calls[0]!.jsonSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
    });
  });

  it('repairs invalid output once, on the same provider', async () => {
    const { primary, secondary, run } = setup();
    primary.script('system.selftest', { text: 'not json' }, { text: good });
    const result = await run();
    expect(result).toMatchObject({ status: 'SUCCESS', attempt: 2 });
    expect(primary.calls).toHaveLength(2);
    expect(primary.calls[1]!.effort).toBe('low');
    expect(primary.calls[1]!.blocks.at(-1)!.text).toContain(
      'did not match the required JSON schema',
    );
    expect(secondary.calls).toHaveLength(0);
  });

  it('fails INVALID_OUTPUT after one failed repair, without falling back', async () => {
    const { primary, secondary, run } = setup();
    primary.script(
      'system.selftest',
      { text: '{"status":"nope"}' },
      { text: '{"status":"ok","echo":"x","sum":"five"}' },
    );
    const result = await run();
    expect(result.status).toBe('INVALID_OUTPUT');
    expect(result.issues?.join(' ')).toContain('sum');
    expect(secondary.calls).toHaveLength(0);
  });

  it('maps a refusal to MODEL_REFUSED without falling back', async () => {
    const { primary, secondary, run } = setup();
    primary.script('system.selftest', { text: '', stopReason: 'refusal' });
    expect((await run()).status).toBe('MODEL_REFUSED');
    expect(secondary.calls).toHaveLength(0);
  });

  it('waits on a short Retry-After and retries the same provider', async () => {
    const { primary, secondary, run } = setup();
    primary.script(
      'system.selftest',
      { error: new LlmError('RATE_LIMITED', '429', 0) },
      { text: good },
    );
    expect((await run()).status).toBe('SUCCESS');
    expect(primary.calls).toHaveLength(2);
    expect(secondary.calls).toHaveLength(0);
  });

  it('falls back to the next provider when the first is unavailable or rate limited for long', async () => {
    const { primary, secondary, run } = setup();
    primary.script('system.selftest', { error: new LlmError('UNAVAILABLE', '503') });
    secondary.script('system.selftest', { text: good });
    expect(await run()).toMatchObject({ status: 'SUCCESS', provider: 'openai', model: 'model-b' });

    const second = setup();
    second.primary.script('system.selftest', { error: new LlmError('RATE_LIMITED', '429', 120) });
    second.secondary.script('system.selftest', { text: good });
    expect((await second.run()).provider).toBe('openai');
  });

  it('reports TIMEOUT when every provider times out, and never falls back on our own bad request', async () => {
    const { primary, secondary, run } = setup();
    primary.script('system.selftest', { error: new LlmError('TIMEOUT', 't') });
    secondary.script('system.selftest', { error: new LlmError('TIMEOUT', 't') });
    expect((await run()).status).toBe('TIMEOUT');

    const other = setup();
    other.primary.script('system.selftest', { error: new LlmError('BAD_REQUEST', '400') });
    expect(await other.run()).toMatchObject({ status: 'PROVIDER_ERROR', errorCode: 'BAD_REQUEST' });
    expect(other.secondary.calls).toHaveLength(0);
  });

  it('skips a provider while its circuit is open', async () => {
    const breaker = new CircuitBreaker({ consecutiveFailures: 1 });
    const { primary, secondary, run } = setup(breaker);
    primary.script('system.selftest', { error: new LlmError('UNAVAILABLE', '503') });
    secondary.script('system.selftest', { text: good }, { text: good });
    await run();
    await run();
    expect(primary.calls).toHaveLength(1); // second call skipped the open circuit
    expect(secondary.calls).toHaveLength(2);
  });
});

describe('CircuitBreaker', () => {
  it('opens after consecutive failures, half-opens after the cool-down, closes on success', () => {
    let now = 0;
    const breaker = new CircuitBreaker({ consecutiveFailures: 3, openMs: 1000 }, () => now);
    for (let i = 0; i < 3; i++) breaker.failure('k');
    expect(breaker.allow('k')).toBe(false);
    now = 1001;
    expect(breaker.allow('k')).toBe(true); // one trial
    expect(breaker.allow('k')).toBe(false); // only one at a time
    breaker.success('k');
    expect(breaker.allow('k')).toBe(true);
    expect(breaker.isOpen('k')).toBe(false);
  });

  it('opens on a high error rate and re-opens when the half-open trial fails', () => {
    let now = 0;
    const breaker = new CircuitBreaker(
      { consecutiveFailures: 100, window: 4, errorRate: 0.5, openMs: 10 },
      () => now,
    );
    breaker.failure('k');
    breaker.success('k');
    breaker.failure('k');
    breaker.failure('k');
    expect(breaker.isOpen('k')).toBe(true);
    now = 20;
    expect(breaker.allow('k')).toBe(true);
    breaker.failure('k');
    expect(breaker.allow('k')).toBe(false);
  });
});

describe('provider request mapping', () => {
  const request: LlmRequest = {
    task: 'system.selftest',
    model: 'claude-haiku-5-5',
    system: 'SYSTEM',
    blocks: [{ text: 'context', cache: true }, { text: 'task' }],
    jsonSchema: { type: 'object', additionalProperties: false },
    maxOutputTokens: 200,
    effort: 'low',
    temperature: 0,
    timeoutMs: 1000,
    serverFallback: false,
  };

  it('Anthropic: structured output + effort, cache breakpoints, no tools, no sampling params', () => {
    const params = AnthropicProvider.buildParams(request);
    expect(params.output_config).toEqual({
      effort: 'low',
      format: { type: 'json_schema', schema: request.jsonSchema },
    });
    expect(params.system[0]).toMatchObject({
      text: 'SYSTEM',
      cache_control: { type: 'ephemeral' },
    });
    expect(params.messages[0]!.content[0]).toMatchObject({
      text: 'context',
      cache_control: { type: 'ephemeral' },
    });
    expect(params.messages[0]!.content[1]).not.toHaveProperty('cache_control');
    expect(params).not.toHaveProperty('tools');
    expect(params).not.toHaveProperty('temperature');
  });

  it('OpenAI: strict JSON schema response format, temperature, no tools', () => {
    const params = OpenAiProvider.buildParams({ ...request, model: 'gpt-x', temperature: 0.4 });
    expect(params.response_format).toMatchObject({
      type: 'json_schema',
      json_schema: { name: 'system_selftest', strict: true },
    });
    expect(params.temperature).toBe(0.4);
    expect(params.messages.map((m) => m.role)).toEqual(['system', 'user']);
    expect(params).not.toHaveProperty('tools');
  });
});
