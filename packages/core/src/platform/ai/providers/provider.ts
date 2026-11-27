import type { AiEffort, AiProviderName } from '../types.js';

/**
 * Provider-neutral LLM request (05-ai-orchestration §2). Adapters map it to each provider's API;
 * they are the only code that imports provider SDKs (AGENTS.md rule 7).
 */
export interface LlmRequest {
  task: string;
  model: string;
  /** Static system prompt: cacheable, never concatenated with variables (AIC-CALL-02). */
  system: string;
  /** User-turn blocks in stable → variable order; `cache` marks a cache breakpoint after it. */
  blocks: Array<{ text: string; cache?: boolean }>;
  /** JSON Schema of the expected output (derived from the prompt's Zod schema). */
  jsonSchema: Record<string, unknown>;
  /** For the fake provider: the deterministic output to return. Never sent anywhere. */
  fakeOutput?: unknown;
  maxOutputTokens: number;
  effort: AiEffort;
  temperature: number;
  timeoutMs: number;
  /** Anthropic server-side refusal fallback (routing config). */
  serverFallback: boolean;
  /** Reasoning model: effort instead of sampling params (routing config). */
  reasoning: boolean;
  signal?: AbortSignal;
}

export interface LlmUsage {
  /** Total input tokens, cached ones included. */
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

export interface LlmResult {
  /** Raw text of the model's answer (JSON expected). */
  text: string;
  usage: LlmUsage;
  /** The model that actually answered (may differ after a server-side refusal fallback). */
  model: string;
  stopReason: 'end' | 'max_tokens' | 'refusal' | 'other';
}

export type LlmErrorKind = 'RATE_LIMITED' | 'UNAVAILABLE' | 'TIMEOUT' | 'BAD_REQUEST' | 'AUTH';

/** Normalised provider failure. Messages never contain prompt or completion text. */
export class LlmError extends Error {
  constructor(
    readonly kind: LlmErrorKind,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

export interface LlmProvider {
  readonly name: AiProviderName;
  complete(request: LlmRequest): Promise<LlmResult>;
}

/** Parse a `Retry-After` header value in seconds (ignores HTTP dates: treated as unknown). */
export function retryAfterSeconds(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}
