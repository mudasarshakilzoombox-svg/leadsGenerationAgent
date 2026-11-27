// The provider adapter is the only place allowed to import the SDK (AGENTS.md rule 7).
// eslint-disable-next-line no-restricted-imports
import OpenAI from 'openai';
import {
  type LlmProvider,
  type LlmRequest,
  type LlmResult,
  LlmError,
  retryAfterSeconds,
} from './provider.js';

/**
 * OpenAI Chat Completions adapter, the fallback provider (ADR-0009, ADR-0037). Strict JSON-schema
 * response format, no tools. Reasoning models (the default) get `reasoning_effort` from the task
 * spec and no sampling params; non-reasoning models get the task temperature. SDK retries are off: the gateway owns
 * retries and fallback. Prompt caching is automatic on OpenAI (stable prefix first).
 */
export class OpenAiProvider implements LlmProvider {
  readonly name = 'openai' as const;
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey, maxRetries: 0 });
  }

  static buildParams(request: LlmRequest) {
    return {
      model: request.model,
      max_completion_tokens: request.maxOutputTokens,
      ...(request.reasoning
        ? { reasoning_effort: request.effort }
        : { temperature: request.temperature }),
      messages: [
        { role: 'system' as const, content: request.system },
        { role: 'user' as const, content: request.blocks.map((b) => b.text).join('\n\n') },
      ],
      response_format: {
        type: 'json_schema' as const,
        json_schema: {
          name: request.task.replace(/[^a-zA-Z0-9_-]/g, '_'),
          schema: request.jsonSchema,
          strict: true,
        },
      },
    };
  }

  async complete(request: LlmRequest): Promise<LlmResult> {
    try {
      const completion = await this.client.chat.completions.create(
        OpenAiProvider.buildParams(request),
        {
          timeout: request.timeoutMs,
          ...(request.signal ? { signal: request.signal } : {}),
        },
      );
      const choice = completion.choices[0];
      const refused = Boolean(choice?.message.refusal);
      const usage = completion.usage;
      return {
        text: choice?.message.content ?? '',
        model: completion.model,
        usage: {
          inputTokens: usage?.prompt_tokens ?? 0,
          cachedInputTokens: usage?.prompt_tokens_details?.cached_tokens ?? 0,
          outputTokens: usage?.completion_tokens ?? 0,
        },
        stopReason: refused
          ? 'refusal'
          : choice?.finish_reason === 'stop'
            ? 'end'
            : choice?.finish_reason === 'length'
              ? 'max_tokens'
              : 'other',
      };
    } catch (error) {
      throw toLlmError(error);
    }
  }
}

function toLlmError(error: unknown): LlmError {
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return new LlmError('TIMEOUT', 'OpenAI request timed out');
  }
  if (error instanceof OpenAI.RateLimitError) {
    return new LlmError(
      'RATE_LIMITED',
      'OpenAI rate limit',
      retryAfterSeconds(error.headers?.get('retry-after')),
    );
  }
  if (
    error instanceof OpenAI.AuthenticationError ||
    error instanceof OpenAI.PermissionDeniedError
  ) {
    return new LlmError('AUTH', `OpenAI rejected the credentials (${error.status})`);
  }
  if (error instanceof OpenAI.BadRequestError || error instanceof OpenAI.NotFoundError) {
    return new LlmError('BAD_REQUEST', `OpenAI rejected the request (${error.status})`);
  }
  return new LlmError('UNAVAILABLE', 'OpenAI unavailable');
}
