import { HttpException } from '@nestjs/common';
import { type ErrorCode, type FieldError, type ProblemDetails, problemType } from '@lga/contracts';
import { ZodError } from 'zod';
import { DomainError } from './domain-error.js';

export const PROBLEM_TITLES: Readonly<Record<ErrorCode, string>> = {
  VALIDATION_FAILED: 'Validation failed',
  UNAUTHENTICATED: 'Authentication required',
  EMAIL_NOT_VERIFIED: 'Email not verified',
  REAUTH_REQUIRED: 'Re-authentication required',
  PERMISSION_DENIED: 'Permission denied',
  ORIGIN_REJECTED: 'Request origin rejected',
  WORKSPACE_RESTRICTED: 'Workspace restricted',
  NOT_FOUND: 'Not found',
  CONFLICT: 'Conflict',
  ILLEGAL_STATE_TRANSITION: 'Action not allowed in the current state',
  IDEMPOTENCY_CONFLICT: 'Idempotency key reused with a different request',
  IDEMPOTENCY_IN_PROGRESS: 'Request already in progress',
  PRECONDITION_FAILED: 'Resource was modified',
  PRECONDITION_REQUIRED: 'If-Match header required',
  QUOTA_EXCEEDED: 'Plan limit reached',
  CREDITS_INSUFFICIENT: 'Not enough credits',
  PAYLOAD_TOO_LARGE: 'Payload too large',
  LAUNCH_CHECKS_FAILED: 'Launch checks failed',
  UNPROCESSABLE: 'Request cannot be processed',
  RATE_LIMITED: 'Too many requests',
  PROVIDER_ERROR: 'Upstream provider error',
  SERVICE_UNAVAILABLE: 'Service unavailable',
  INTERNAL: 'Internal server error',
};

const GENERIC_INTERNAL_DETAIL =
  'An unexpected error occurred. Quote the requestId when contacting support.';

export interface ProblemContext {
  /** Request path without query string. */
  instance: string;
  requestId?: string | undefined;
}

export interface ProblemResult {
  problem: ProblemDetails;
  /** How the filter should log this: expected 4xx are `warn`, everything else `error`. */
  logLevel: 'warn' | 'error';
}

function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 400:
      return 'VALIDATION_FAILED';
    case 401:
      return 'UNAUTHENTICATED';
    case 403:
      return 'PERMISSION_DENIED';
    case 404:
    case 405:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 412:
      return 'PRECONDITION_FAILED';
    case 413:
      return 'PAYLOAD_TOO_LARGE';
    case 428:
      return 'PRECONDITION_REQUIRED';
    case 429:
      return 'RATE_LIMITED';
    case 502:
      return 'PROVIDER_ERROR';
    case 503:
      return 'SERVICE_UNAVAILABLE';
    default:
      return status >= 500 ? 'INTERNAL' : 'UNPROCESSABLE';
  }
}

function zodToFieldErrors(error: ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    pointer:
      '/' + issue.path.map((p) => String(p).replaceAll('~', '~0').replaceAll('/', '~1')).join('/'),
    code: issue.code,
    message: issue.message,
  }));
}

/** Errors raised by Express body parsers (`body-parser` / `raw-body`). */
function isBodyParserError(e: unknown): e is { type: string; status: number } {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as { type?: unknown }).type === 'string' &&
    typeof (e as { status?: unknown }).status === 'number' &&
    String((e as { type: string }).type).startsWith('entity.')
  );
}

function build(
  code: ErrorCode,
  status: number,
  ctx: ProblemContext,
  detail?: string,
  extra: Partial<ProblemDetails> = {},
): ProblemDetails {
  return {
    type: problemType(code),
    title: PROBLEM_TITLES[code],
    status,
    code,
    ...(detail ? { detail } : {}),
    instance: ctx.instance,
    ...(ctx.requestId ? { requestId: ctx.requestId } : {}),
    ...extra,
  };
}

/** Map any thrown value to RFC 9457 problem details. Pure and side-effect free (unit tested). */
export function toProblem(exception: unknown, ctx: ProblemContext): ProblemResult {
  if (exception instanceof DomainError) {
    const problem = build(exception.code, exception.status, ctx, exception.detail, {
      ...(exception.title ? { title: exception.title } : {}),
      ...(exception.errors ? { errors: exception.errors } : {}),
      ...(exception.extensions ?? {}),
    });
    return { problem, logLevel: exception.status >= 500 ? 'error' : 'warn' };
  }

  if (exception instanceof ZodError) {
    return {
      problem: build('VALIDATION_FAILED', 400, ctx, 'The request is invalid.', {
        errors: zodToFieldErrors(exception),
      }),
      logLevel: 'warn',
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const code = codeForStatus(status);
    const detail = status < 500 ? exception.message : GENERIC_INTERNAL_DETAIL;
    return {
      problem: build(code, status, ctx, detail),
      logLevel: status >= 500 ? 'error' : 'warn',
    };
  }

  if (isBodyParserError(exception)) {
    if (exception.type === 'entity.too.large') {
      return {
        problem: build('PAYLOAD_TOO_LARGE', 413, ctx, 'The request body is too large.'),
        logLevel: 'warn',
      };
    }
    if (exception.status < 500) {
      return {
        problem: build('VALIDATION_FAILED', 400, ctx, 'The request body could not be parsed.'),
        logLevel: 'warn',
      };
    }
  }

  return { problem: build('INTERNAL', 500, ctx, GENERIC_INTERNAL_DETAIL), logLevel: 'error' };
}
