import { z } from 'zod';

/**
 * Server-side environment of the web app. Only APP_ORIGIN-style public values may ever be
 * exposed to the browser. No secrets belong here (ADR-0003: the web app holds none).
 */
export const webEnvSchema = z.object({
  INTERNAL_API_URL: z.url().default('http://localhost:4000'),
  APP_ORIGIN: z.url().default('http://localhost:3300'),
  APP_ENV: z.enum(['local', 'test', 'staging', 'production']).default('local'),
  RELEASE: z.string().min(1).max(64).default('dev'),
});
export type WebEnv = z.output<typeof webEnvSchema>;
