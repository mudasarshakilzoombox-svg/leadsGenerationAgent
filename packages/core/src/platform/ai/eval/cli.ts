/* eslint-disable no-console -- a command-line tool: its output is the report. */
// `pnpm ai:eval <task> [--provider fake|anthropic|openai] [--model <id>] [--limit <n>] [--min-pass <0..1>]`
// Real providers are called only when you pass --provider anthropic|openai and the key is set
// (AGENTS.md: real LLM calls only via `pnpm ai:eval` on request). Default: the fake provider.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadAiConfig } from '../config.js';
import { AnthropicProvider } from '../providers/anthropic.adapter.js';
import { FakeProvider } from '../providers/fake.adapter.js';
import { OpenAiProvider } from '../providers/openai.adapter.js';
import type { LlmProvider } from '../providers/provider.js';
import { AI_TASKS, type AiTaskKey } from '../tasks.js';
import { EVAL_DIR, loadCases, runEval } from './run-eval.js';

const rootEnv = path.resolve(EVAL_DIR, '../../../../.env');
if (existsSync(rootEnv)) {
  const before = { ...process.env };
  process.loadEnvFile(rootEnv);
  Object.assign(process.env, before);
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    provider: { type: 'string', default: 'fake' },
    model: { type: 'string' },
    limit: { type: 'string' },
    'min-pass': { type: 'string', default: '0.9' },
  },
});

function fail(message: string): never {
  console.error(`ai:eval: ${message}`);
  process.exit(2);
}

const task = positionals[0] as AiTaskKey | undefined;
if (!task || !(task in AI_TASKS)) fail(`give a task: ${Object.keys(AI_TASKS).join(', ')}`);

const config = loadAiConfig({
  routingFile: process.env.AI_ROUTING_FILE,
  pricingFile: process.env.AI_PRICING_FILE,
});
const tier = config.routing.tasks[task]?.tier ?? AI_TASKS[task].tier;

let provider: LlmProvider;
switch (values.provider) {
  case 'fake':
    provider = new FakeProvider();
    break;
  case 'anthropic':
    if (!process.env.ANTHROPIC_API_KEY) fail('ANTHROPIC_API_KEY is not set');
    provider = new AnthropicProvider(process.env.ANTHROPIC_API_KEY);
    break;
  case 'openai':
    if (!process.env.OPENAI_API_KEY) fail('OPENAI_API_KEY is not set');
    provider = new OpenAiProvider(process.env.OPENAI_API_KEY);
    break;
  default:
    fail(`unknown provider ${values.provider}`);
}

const routed = config.routing.tiers[tier].find((r) => r.provider === values.provider)?.model;
const model = values.model ?? routed ?? (values.provider === 'fake' ? 'fake-model' : undefined);
if (!model) fail(`no ${values.provider} model routed for tier ${tier}: pass --model <id>`);

let cases = loadCases(task);
if (values.limit) cases = cases.slice(0, Number(values.limit));

const report = await runEval({ task, config, provider, model, cases });
const reportsDir = path.join(EVAL_DIR, 'reports');
mkdirSync(reportsDir, { recursive: true });
const file = path.join(
  reportsDir,
  `${task}-${values.provider}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
);
writeFileSync(file, JSON.stringify(report, null, 2));

console.log(
  `\nAI eval  ${report.task}@v${report.promptVersion}  ${report.provider}/${report.model}`,
);
for (const r of report.results) {
  console.log(
    `  ${r.pass ? '✓' : '✗'} ${r.id.padEnd(24)} ${r.status.padEnd(14)} ${String(r.latencyMs).padStart(6)} ms${r.detail ? `  ${r.detail}` : ''}`,
  );
}
console.log(
  `\n  passed ${report.passed}/${report.cases} (${(report.passRate * 100).toFixed(1)}%)` +
    `  mean ${report.meanLatencyMs} ms  tokens in ${report.inputTokens} / out ${report.outputTokens}` +
    `  cost $${(Number(report.costMicros) / 1e6).toFixed(6)}`,
);
console.log(`  report: ${path.relative(process.cwd(), file)}\n`);
process.exit(report.passRate >= Number(values['min-pass']) ? 0 : 1);
