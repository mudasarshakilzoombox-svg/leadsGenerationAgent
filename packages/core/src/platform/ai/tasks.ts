import type { z } from 'zod';
import type { AiEffort, AiTier } from './types.js';

/**
 * AI task catalog (05-ai-orchestration §4). One entry per task key: limits are enforced before
 * the call (AIC-PRE-06, AIC-CALL-03). Feature tasks (website.extract, icp.generate, ...) are added
 * with their prompts in later phases.
 */
export interface AiTaskSpec {
  key: string;
  tier: AiTier;
  maxInputTokens: number;
  maxOutputTokens: number;
  /** Anthropic: reasoning effort (sampling params are rejected by current Claude models). */
  effort: AiEffort;
  /** OpenAI: sampling temperature. */
  temperature: number;
  timeoutMs: number;
  /** Customer price in millicredits (PRD §8.4); null = always free (no reservation). */
  creditsMilli: number | null;
  /** The input contains untrusted text (websites, inbound email): sanitize + injection checks. */
  untrustedInput: boolean;
}

export const AI_TASKS = {
  'system.selftest': {
    key: 'system.selftest',
    tier: 'fast',
    maxInputTokens: 1_000,
    maxOutputTokens: 200,
    effort: 'low',
    temperature: 0,
    timeoutMs: 20_000,
    creditsMilli: null,
    untrustedInput: false,
  },
} as const satisfies Record<string, AiTaskSpec>;

export type AiTaskKey = keyof typeof AI_TASKS;

export function taskSpec(key: string): AiTaskSpec {
  const spec = (AI_TASKS as Record<string, AiTaskSpec>)[key];
  if (!spec) throw new Error(`Unknown AI task ${key}`);
  return spec;
}

/** One block of the user turn, ordered stable → variable (05 §5). */
export interface PromptBlock {
  kind: 'context' | 'task' | 'untrusted';
  text: string;
  /** Put a cache breakpoint after this block (stable workspace context). */
  cache?: boolean;
  /** For untrusted blocks: where the text came from and its id (no content). */
  source?: string;
  id?: string;
}

/**
 * A versioned prompt module (ADR-0031): reviewed like code, never edited at runtime. The system
 * text is static (cacheable and never concatenated with variables, AIC-CALL-02).
 */
export interface PromptModule<Vars, Out> {
  task: AiTaskKey;
  version: number;
  system: string;
  /** Strict schema of the allowed context (AIC-PRE-10): unknown fields are a BLOCK. */
  contextSchema: z.ZodType<Vars>;
  buildUser(vars: Vars): PromptBlock[];
  /** Strict output schema (AIC-OUT-01/02). */
  outputSchema: z.ZodType<Out>;
  /** Deterministic output for the fake provider (tests, local dev, CI evals). */
  fakeOutput(vars: Vars): Out;
  /** Eval scorer for golden cases (`pnpm ai:eval`). */
  score(vars: Vars, output: Out): { pass: boolean; detail?: string };
}
