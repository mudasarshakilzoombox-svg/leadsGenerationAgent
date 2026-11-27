import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { AiRunRecord, AiRunSink } from '../ai-run-recorder.js';
import { AI_CONFIG_DIR, type AiConfig, type AiRoute } from '../config.js';
import { AiGateway } from '../gateway.js';
import { type ActionGate, AiActionPipeline } from '../pipeline.js';
import { getPrompt } from '../prompts/registry.js';
import type { LlmProvider } from '../providers/provider.js';
import { type AiTaskKey, taskSpec } from '../tasks.js';

/**
 * Eval harness (05-ai-orchestration §11, ADR-0031): runs a task's golden cases through the real
 * AiActionPipeline (every check included) against one provider, scores each output with the
 * prompt module's scorer and reports pass rate, latency, tokens and cost. Nothing is written to
 * the database: runs go to an in-memory sink.
 */

export const EVAL_DIR = path.resolve(AI_CONFIG_DIR, '../test/ai-evals');

export interface EvalCase {
  id: string;
  context: unknown;
}

export interface EvalCaseResult {
  id: string;
  pass: boolean;
  status: string;
  detail?: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costMicros: string;
}

export interface EvalReport {
  task: string;
  promptVersion: number;
  provider: string;
  model: string;
  cases: number;
  passed: number;
  passRate: number;
  meanLatencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costMicros: string;
  results: EvalCaseResult[];
}

export function loadCases(task: string, dir = EVAL_DIR): EvalCase[] {
  const file = path.join(dir, task, 'cases.jsonl');
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.trim().startsWith('//'))
    .map((line, index) => {
      const value = JSON.parse(line) as Partial<EvalCase>;
      if (!value.id || value.context === undefined)
        throw new Error(`${file}:${index + 1}: needs "id" and "context"`);
      return { id: value.id, context: value.context };
    });
}

class MemorySink implements AiRunSink {
  readonly runs: AiRunRecord[] = [];
  record(run: AiRunRecord): Promise<string> {
    this.runs.push(run);
    return Promise.resolve(`eval-${this.runs.length}`);
  }
}

const NO_EFFECTS: ActionGate<unknown, { type: 'none' }> = { allowed: [], decide: () => [] };

export async function runEval(options: {
  task: AiTaskKey;
  config: AiConfig;
  provider: LlmProvider;
  model: string;
  cases: EvalCase[];
}): Promise<EvalReport> {
  const spec = taskSpec(options.task);
  const tier = options.config.routing.tasks[options.task]?.tier ?? spec.tier;
  const route: AiRoute = {
    provider: options.provider.name,
    model: options.model,
    rpm: 1_000,
    serverFallback: false,
  };
  // Pin the task's tier to the one provider/model under test (no fallback during evals).
  const config: AiConfig = {
    ...options.config,
    routing: {
      ...options.config.routing,
      tiers: { ...options.config.routing.tiers, [tier]: [route] },
    },
  };
  const fakeMode = options.provider.name === 'fake';
  const gateway = new AiGateway(config, { [options.provider.name]: options.provider }, null, {
    fakeMode,
  });
  const sink = new MemorySink();
  const pipeline = new AiActionPipeline(config, gateway, sink, { globalDisabled: false });
  const version = config.routing.tasks[options.task]?.promptVersion ?? 1;
  const prompt = getPrompt(options.task, version);

  const results: EvalCaseResult[] = [];
  for (const testCase of options.cases) {
    const result = await pipeline.run({
      task: options.task,
      context: testCase.context,
      scope: { workspaceId: null, actorUserId: null, entity: { type: 'eval', id: testCase.id } },
      gate: NO_EFFECTS,
    });
    const run = sink.runs.at(-1)!;
    const scored = result.ok
      ? prompt.score(testCase.context, result.output)
      : { pass: false, detail: result.status };
    results.push({
      id: testCase.id,
      pass: scored.pass,
      status: result.status,
      ...(scored.detail ? { detail: scored.detail } : {}),
      latencyMs: run.latencyMs,
      inputTokens: run.usage.inputTokens,
      outputTokens: run.usage.outputTokens,
      costMicros: run.costMicros.toString(),
    });
  }

  const passed = results.filter((r) => r.pass).length;
  const sum = (pick: (r: EvalCaseResult) => number) => results.reduce((n, r) => n + pick(r), 0);
  return {
    task: options.task,
    promptVersion: version,
    provider: options.provider.name,
    model: options.model,
    cases: results.length,
    passed,
    passRate: results.length ? passed / results.length : 0,
    meanLatencyMs: results.length ? Math.round(sum((r) => r.latencyMs) / results.length) : 0,
    inputTokens: sum((r) => r.inputTokens),
    outputTokens: sum((r) => r.outputTokens),
    costMicros: results.reduce((n, r) => n + BigInt(r.costMicros), 0n).toString(),
    results,
  };
}
