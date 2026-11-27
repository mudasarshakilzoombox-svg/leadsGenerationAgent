import { type FieldError, ProblemDetailsSchema } from '@lga/contracts';

/** An API failure as the UI needs it: stable code, plain message, field errors, request id. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
    readonly fieldErrors: FieldError[] = [],
    readonly requestId?: string,
    readonly retryAfterSeconds?: number,
    readonly extensions: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static async fromResponse(res: Response): Promise<ApiError> {
    const body: unknown = await res.json().catch(() => undefined);
    const parsed = ProblemDetailsSchema.safeParse(body);
    const retryHeader = Number(res.headers.get('retry-after'));
    if (!parsed.success) {
      return new ApiError(res.status, undefined, `Request failed (${res.status}). Try again.`);
    }
    const p = parsed.data;
    return new ApiError(
      p.status,
      p.code,
      p.detail ?? p.title,
      p.errors ?? [],
      p.requestId,
      Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader : undefined,
      p as Record<string, unknown>,
    );
  }
}

/** Plain-language message for toasts (PRD §9.1: what happened and what to do, with a reference). */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return error.retryAfterSeconds
        ? `Too many attempts. Try again in ${error.retryAfterSeconds} seconds.`
        : 'Too many attempts. Try again shortly.';
    }
    if (error.status >= 500) {
      return `Something went wrong on our side. Try again.${error.requestId ? ` Reference: ${error.requestId.slice(0, 8)}` : ''}`;
    }
    return error.message;
  }
  if (error instanceof TypeError)
    return 'You appear to be offline. Check your connection and try again.';
  return 'Something went wrong. Try again.';
}
