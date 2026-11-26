import { z } from 'zod';

export interface EnvIssue {
  /** Variable name, e.g. `DATABASE_URL`. */
  variable: string;
  message: string;
}

/**
 * Thrown when environment validation fails. The message lists variable names and
 * reasons only. It never includes values, because values may be secrets.
 */
export class EnvValidationError extends Error {
  constructor(
    readonly service: string,
    readonly issues: readonly EnvIssue[],
  ) {
    super(
      `[${service}] Invalid environment configuration:\n` +
        issues.map((i) => `  - ${i.variable}: ${i.message}`).join('\n'),
    );
    this.name = 'EnvValidationError';
  }
}

/** Parse and validate an environment object (usually `process.env`). */
export function parseEnv<S extends z.ZodType>(
  schema: S,
  source: Record<string, string | undefined>,
  service: string,
): z.output<S> {
  // Treat empty strings as "unset" so optional/default rules apply to `FOO=` lines.
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value !== '') cleaned[key] = value;
  }

  const result = schema.safeParse(cleaned);
  if (result.success) return result.data;

  const issues = result.error.issues.map((issue) => ({
    variable: issue.path.length > 0 ? issue.path.map(String).join('.') : '(root)',
    message: sanitizeMessage(issue.message),
  }));
  throw new EnvValidationError(service, issues);
}

/** Zod messages may echo received values ("received 'abc'"), so strip those parts. */
function sanitizeMessage(message: string): string {
  return message.replace(/,?\s*received\s+.+$/i, '').trim();
}

/** Boolean env flag: accepts true/false/1/0/yes/no (case-insensitive). */
export const envBoolean = z
  .enum(['true', 'false', '1', '0', 'yes', 'no', 'TRUE', 'FALSE', 'YES', 'NO'])
  .transform((value) => ['true', '1', 'yes'].includes(value.toLowerCase()));

/** TCP port number from a string. */
export const envPort = z.coerce.number().int().min(1).max(65535);
