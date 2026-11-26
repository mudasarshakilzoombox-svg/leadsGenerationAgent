import { z } from 'zod';

/**
 * Stable error codes returned in RFC 9457 problem details.
 * Catalog: docs/architecture/03-api.md §4. Add codes here first, then document them.
 */
export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'EMAIL_NOT_VERIFIED',
  'REAUTH_REQUIRED',
  'PERMISSION_DENIED',
  'ORIGIN_REJECTED',
  'WORKSPACE_RESTRICTED',
  'NOT_FOUND',
  'CONFLICT',
  'ILLEGAL_STATE_TRANSITION',
  'IDEMPOTENCY_CONFLICT',
  'IDEMPOTENCY_IN_PROGRESS',
  'PRECONDITION_FAILED',
  'PRECONDITION_REQUIRED',
  'QUOTA_EXCEEDED',
  'CREDITS_INSUFFICIENT',
  'PAYLOAD_TOO_LARGE',
  'LAUNCH_CHECKS_FAILED',
  'UNPROCESSABLE',
  'RATE_LIMITED',
  'PROVIDER_ERROR',
  'SERVICE_UNAVAILABLE',
  'INTERNAL',
] as const;

export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/** Default HTTP status for each error code. */
export const ERROR_STATUS: Readonly<Record<ErrorCode, number>> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  EMAIL_NOT_VERIFIED: 403,
  REAUTH_REQUIRED: 403,
  PERMISSION_DENIED: 403,
  ORIGIN_REJECTED: 403,
  WORKSPACE_RESTRICTED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  ILLEGAL_STATE_TRANSITION: 409,
  IDEMPOTENCY_CONFLICT: 409,
  IDEMPOTENCY_IN_PROGRESS: 409,
  PRECONDITION_FAILED: 412,
  PRECONDITION_REQUIRED: 428,
  QUOTA_EXCEEDED: 402,
  CREDITS_INSUFFICIENT: 402,
  PAYLOAD_TOO_LARGE: 413,
  LAUNCH_CHECKS_FAILED: 422,
  UNPROCESSABLE: 422,
  RATE_LIMITED: 429,
  PROVIDER_ERROR: 502,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL: 500,
};

export const FieldErrorSchema = z.object({
  /** JSON Pointer (RFC 6901) to the invalid field, e.g. `/name` or `/steps/0/delayDays`. */
  pointer: z.string(),
  code: z.string(),
  message: z.string(),
});
export type FieldError = z.infer<typeof FieldErrorSchema>;

/** RFC 9457 problem details with our extensions. Extra members (e.g. `limit`) are allowed. */
export const ProblemDetailsSchema = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.number().int().min(400).max(599),
    code: ErrorCodeSchema,
    detail: z.string().optional(),
    instance: z.string().optional(),
    requestId: z.string().optional(),
    errors: z.array(FieldErrorSchema).optional(),
  })
  .loose();
export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

export function problemType(code: ErrorCode): string {
  return `urn:lga:problem:${code.toLowerCase()}`;
}
