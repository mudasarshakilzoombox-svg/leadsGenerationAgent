import { ERROR_STATUS, type ErrorCode, type FieldError } from '@lga/contracts';

export interface DomainErrorOptions {
  /** Overrides the default status for the code (rarely needed). */
  status?: number;
  title?: string;
  errors?: FieldError[];
  /** Extra problem-details members, e.g. `{ limit: {...} }`. Must not contain secrets or PII. */
  extensions?: Record<string, unknown>;
  cause?: unknown;
}

/**
 * Expected, user-facing failure with a stable error code.
 * Rendered as RFC 9457 problem details by ProblemDetailsFilter.
 */
export class DomainError extends Error {
  readonly status: number;
  readonly title: string | undefined;
  readonly errors: FieldError[] | undefined;
  readonly extensions: Record<string, unknown> | undefined;

  constructor(
    readonly code: ErrorCode,
    readonly detail?: string,
    options: DomainErrorOptions = {},
  ) {
    super(detail ?? code, { cause: options.cause });
    this.name = 'DomainError';
    this.status = options.status ?? ERROR_STATUS[code];
    this.title = options.title;
    this.errors = options.errors;
    this.extensions = options.extensions;
  }
}
