// The provider adapter is the only place allowed to import the SDK (AGENTS.md rule 7).
// eslint-disable-next-line no-restricted-imports
import Anthropic from '@anthropic-ai/sdk';
import {
  type LlmProvider,
  type LlmRequest,
  type LlmResult,
  LlmError,
  retryAfterSeconds,
} from './provider.js';

/**
 * Anthropic Messages API adapter (ADR-0037).
 * - Structured output via `output_config.format` (JSON schema); the gateway still validates with Zod.
 * - No tools and no server tools (AIC-CALL-01, AIC-CALL-05). No sampling params: current Claude
 *   models reject them, depth is controlled with `output_config.effort`.
 * - Cache breakpoints on the static system prompt and on stable context blocks (05 §5).
 * - SDK retries are off: the gateway owns retries, fallback and the circuit breaker.
 * - Optional server-side refusal fallback (beta) where the routing config enables it.
 */
export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic' as const;
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 0 });
  }

  /** The request body, separate from the call so tests can check the mapping. */
  static buildParams(request: LlmRequest) {
    return {
      model: request.model,
      max_tokens: request.maxOutputTokens,
      system: [
        {
          type: 'text' as const,
          text: request.system,
          cache_control: { type: 'ephemeral' as const },
        },
      ],
      messages: [
        {
          role: 'user' as const,
          content: request.blocks.map((block) => ({
            type: 'text' as const,
            text: block.text,
            ...(block.cache ? { cache_control: { type: 'ephemeral' as const } } : {}),
          })),
        },
      ],
      output_config: {
        effort: request.effort,
        format: { type: 'json_schema' as const, schema: request.jsonSchema },
      },
    };
  }

  async complete(request: LlmRequest): Promise<LlmResult> {
    const params = AnthropicProvider.buildParams(request);
    const options = {
      timeout: request.timeoutMs,
      ...(request.signal ? { signal: request.signal } : {}),
    };
    try {
      const message = request.serverFallback
        ? await this.client.beta.messages.create(
            { ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' },
            options,
          )
        : await this.client.messages.create(params, options);
      const text = message.content
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('');
      const usage = message.usage;
      const cached = usage.cache_read_input_tokens ?? 0;
      const created = usage.cache_creation_input_tokens ?? 0;
      return {
        text,
        model: message.model,
        usage: {
          // input_tokens excludes cache reads and writes: report the total, with cached reads apart.
          inputTokens: usage.input_tokens + cached + created,
          cachedInputTokens: cached,
          outputTokens: usage.output_tokens,
        },
        stopReason:
          message.stop_reason === 'end_turn'
            ? 'end'
            : message.stop_reason === 'max_tokens'
              ? 'max_tokens'
              : message.stop_reason === 'refusal'
                ? 'refusal'
                : 'other',
      };
    } catch (error) {
      throw toLlmError(error);
    }
  }
}

function toLlmError(error: unknown): LlmError {
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new LlmError('TIMEOUT', 'Anthropic request timed out');
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new LlmError(
      'RATE_LIMITED',
      'Anthropic rate limit',
      retryAfterSeconds(error.headers?.get('retry-after')),
    );
  }
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return new LlmError('AUTH', `Anthropic rejected the credentials (${error.status})`);
  }
  if (error instanceof Anthropic.BadRequestError || error instanceof Anthropic.NotFoundError) {
    return new LlmError('BAD_REQUEST', `Anthropic rejected the request (${error.status})`);
  }
  if (error instanceof Anthropic.APIConnectionError || error instanceof Anthropic.APIError) {
    return new LlmError('UNAVAILABLE', 'Anthropic unavailable');
  }
  return new LlmError('UNAVAILABLE', 'Anthropic call failed');
}
