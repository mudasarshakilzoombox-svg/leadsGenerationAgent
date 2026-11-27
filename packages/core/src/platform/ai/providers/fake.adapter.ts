import type { LlmProvider, LlmRequest, LlmResult } from './provider.js';

/**
 * Deterministic fake LLM (INTEGRATIONS_MODE=fake, tests, CI evals). By default it returns the
 * prompt module's `fakeOutput` as JSON. Tests can script a queue of responses or errors per task
 * to exercise repair, refusals, fallbacks, timeouts and hostile outputs.
 */
export type FakeStep = { text: string; stopReason?: LlmResult['stopReason'] } | { error: Error };

export class FakeProvider implements LlmProvider {
  readonly name = 'fake' as const;
  private readonly scripts = new Map<string, FakeStep[]>();
  readonly calls: LlmRequest[] = [];

  /** Queue responses for a task (consumed in order, then back to the default). */
  script(task: string, ...steps: FakeStep[]): this {
    this.scripts.set(task, [...(this.scripts.get(task) ?? []), ...steps]);
    return this;
  }

  complete(request: LlmRequest): Promise<LlmResult> {
    this.calls.push(request);
    const step = this.scripts.get(request.task)?.shift();
    if (step && 'error' in step) return Promise.reject(step.error);
    const text = step?.text ?? JSON.stringify(request.fakeOutput ?? {});
    const inputChars =
      request.system.length + request.blocks.reduce((n, b) => n + b.text.length, 0);
    return Promise.resolve({
      text,
      model: request.model,
      usage: {
        inputTokens: Math.ceil(inputChars / 4),
        cachedInputTokens: 0,
        outputTokens: Math.ceil(text.length / 4),
      },
      stopReason: step?.stopReason ?? 'end',
    });
  }
}
