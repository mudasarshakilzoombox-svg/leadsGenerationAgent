import { describe, expect, it, vi } from 'vitest';
import type { AiRunRecord } from './ai-run-recorder.js';
import { redactBlocks } from './ai-run-recorder.js';
import { type AiConfig, parsePricing, parseRouting } from './config.js';
import { AiGateway } from './gateway.js';
import { type ActionGate, AiActionPipeline, type CreditPort } from './pipeline.js';
import { FakeProvider } from './providers/fake.adapter.js';
import { AI_TASKS } from './tasks.js';

const config = (disabled = false): AiConfig => ({
  routing: parseRouting({
    version: 1,
    tiers: {
      fast: [{ provider: 'anthropic', model: 'model-a' }],
      standard: [{ provider: 'anthropic', model: 'model-a' }],
      advanced: [{ provider: 'anthropic', model: 'model-a' }],
    },
    tasks: { 'system.selftest': { promptVersion: 1, disabled } },
  }),
  pricing: parsePricing({
    version: 1,
    models: { 'model-a': { input: 1, cachedInput: 0.1, output: 5 } },
  }),
});

type Effect = { type: 'note' } | { type: 'send' };
const gate: ActionGate<unknown, Effect> = {
  allowed: ['note'],
  // A hostile or buggy gate proposal: 'send' is outside the allowed set and must be dropped.
  decide: () => [{ type: 'note' }, { type: 'send' }],
};

function setup(
  options: {
    disabled?: boolean;
    globalDisabled?: boolean;
    credits?: CreditPort;
    priced?: boolean;
  } = {},
) {
  const provider = new FakeProvider();
  const runs: AiRunRecord[] = [];
  const cfg = config(options.disabled);
  const gateway = new AiGateway(cfg, { anthropic: provider }, null);
  const pipeline = new AiActionPipeline(
    cfg,
    gateway,
    { record: (r) => (runs.push(r), Promise.resolve(`run-${runs.length}`)) },
    {
      globalDisabled: options.globalDisabled ?? false,
      ...(options.credits ? { credits: options.credits } : {}),
      ...(options.priced
        ? {
            taskSpecs: {
              'system.selftest': { ...AI_TASKS['system.selftest'], creditsMilli: 1000 },
            },
          }
        : {}),
    },
  );
  const run = (
    context: unknown = { code: 'ABC123', a: 1, b: 2 },
    workspaceId: string | null = 'ws-1',
  ) =>
    pipeline.run({
      task: 'system.selftest',
      context,
      scope: { workspaceId, actorUserId: null },
      gate,
    });
  return { provider, runs, run };
}

const ids = (r: { checks: { id: string; outcome: string }[] }) =>
  Object.fromEntries(r.checks.map((c) => [c.id, c.outcome]));

describe('AiActionPipeline', () => {
  it('runs checks, calls the model, applies only allowed effects and records one ai_runs row', async () => {
    const { runs, run } = setup();
    const result = await run();
    expect(result).toMatchObject({
      ok: true,
      status: 'SUCCESS',
      aiRunId: 'run-1',
      output: { echo: 'ABC123', sum: 3 },
    });
    expect(result.effects).toEqual([{ type: 'note' }]);
    expect(ids(result)).toMatchObject({
      'AIC-PRE-03': 'PASS',
      'AIC-PRE-10': 'PASS',
      'AIC-PRE-07': 'PASS',
      'AIC-PRE-06': 'PASS',
      'AIC-PRE-11': 'PASS',
      'AIC-OUT-01': 'PASS',
      'AIC-OUT-12': 'PASS',
      'AIC-ACT': 'WARN',
    });
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      task: 'system.selftest',
      promptVersion: 1,
      status: 'SUCCESS',
      provider: 'anthropic',
      model: 'model-a',
    });
  });

  it('fails closed before any call on the kill switch, a rejected context or a foreign entity', async () => {
    for (const [options, context] of [
      [{ globalDisabled: true }, undefined],
      [{ disabled: true }, undefined],
      [{}, { code: 'ABC123', a: 1, b: 2, email: 'ada@x.example' }],
      [{}, { code: 'ABC123', a: 1, b: 2, workspaceId: 'ws-2' }],
    ] as const) {
      const { provider, runs, run } = setup(options);
      const result = await run(context);
      expect(result.ok).toBe(false);
      expect(result.status).toBe('CHECK_BLOCKED');
      expect(provider.calls).toHaveLength(0);
      expect(runs).toHaveLength(1); // the refusal is audited too
      expect(
        JSON.stringify(runs[0], (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)),
      ).not.toContain('ada@x.example');
    }
  });

  it('records the gateway failure status and drops no effects on invalid output', async () => {
    const { provider, runs, run } = setup();
    provider.script('system.selftest', { text: 'x' }, { text: 'y' });
    const result = await run();
    expect(result).toMatchObject({ ok: false, status: 'INVALID_OUTPUT', effects: [] });
    expect(runs[0]!.output).toBeUndefined();
  });

  it('reserves credits for priced tasks: settles on success, releases on failure, blocks without a reservation', async () => {
    const credits = {
      reserve: vi.fn(() => Promise.resolve({ id: 'r1' })),
      settle: vi.fn(() => Promise.resolve()),
      release: vi.fn(() => Promise.resolve()),
    };
    const ok = setup({ priced: true, credits });
    expect((await ok.run()).ok).toBe(true);
    expect(credits.reserve).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'ws-1', millicredits: 1000 }),
    );
    expect(credits.settle).toHaveBeenCalledWith('r1');
    expect(credits.release).not.toHaveBeenCalled();

    const failing = setup({ priced: true, credits });
    failing.provider.script('system.selftest', { text: '', stopReason: 'refusal' });
    expect((await failing.run()).status).toBe('MODEL_REFUSED');
    expect(credits.release).toHaveBeenCalledWith('r1');

    const broke = setup({
      priced: true,
      credits: { ...credits, reserve: vi.fn(() => Promise.resolve(null)) },
    });
    const blocked = await broke.run();
    expect(blocked).toMatchObject({ status: 'BUDGET_BLOCKED', errorCode: 'CREDITS_INSUFFICIENT' });
    expect(broke.provider.calls).toHaveLength(0);
  });

  it('stores request payloads as structure, sizes and hashes only', () => {
    const payload = redactBlocks('system.selftest', 1, [
      { kind: 'untrusted', text: 'Jane Doe jane@x.example', source: 'reply', id: 'm1' },
    ]);
    const json = JSON.stringify(payload);
    expect(json).not.toContain('Jane');
    expect(json).not.toContain('jane@x.example');
    expect(payload).toMatchObject({
      system: 'system.selftest@1',
      blocks: [{ kind: 'untrusted', length: 23, source: 'reply', id: 'm1' }],
    });
  });
});
