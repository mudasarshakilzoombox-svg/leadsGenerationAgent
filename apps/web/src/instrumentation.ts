// Server-side error tracking for the web app (Next.js instrumentation hook). Off unless
// SENTRY_DSN is set; loaded lazily so the dev server and tests never pay for the SDK.
import type { Instrumentation } from 'next';

let report: Instrumentation.onRequestError | undefined;

export async function register(): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || process.env.NEXT_RUNTIME !== 'nodejs') return;
  const Sentry = await import('@sentry/nextjs');
  const { sentryOptions } = await import('./lib/observability/sentry-options');
  Sentry.init(
    sentryOptions({
      dsn,
      release: process.env.RELEASE ?? 'dev',
      environment: process.env.APP_ENV ?? 'local',
    }),
  );
  report = Sentry.captureRequestError;
}

export const onRequestError: Instrumentation.onRequestError = (...args) => report?.(...args);
