import type { PromptModule } from '../tasks.js';
import { systemSelftestV1 } from './system-selftest/v1.js';

/**
 * Prompt registry (ADR-0031): `task@version` → module. The active version per task comes from
 * ai-routing.yaml, so rolling back is a config change. Every prompt change bumps the version.
 */
// `any` here: the registry holds modules of different input/output types; callers narrow by task.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PROMPTS: Record<string, PromptModule<any, any>> = {
  [`${systemSelftestV1.task}@${systemSelftestV1.version}`]: systemSelftestV1,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getPrompt(task: string, version: number): PromptModule<any, any> {
  const prompt = PROMPTS[`${task}@${version}`];
  if (!prompt) throw new Error(`No prompt registered for ${task}@${version}`);
  return prompt;
}

export function registeredPrompts(): string[] {
  return Object.keys(PROMPTS);
}
