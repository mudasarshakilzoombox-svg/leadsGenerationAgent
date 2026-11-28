// Browser error tracking (12-observability §4). The root layout renders the DSN at runtime in a
// <meta> tag only when Sentry is configured; without it no SDK code is downloaded at all.
import { SENTRY_META, type SentryRuntimeConfig } from './lib/observability/sentry-options';

const meta =
  typeof document === 'undefined' ? null : document.querySelector(`meta[name="${SENTRY_META}"]`);
const raw = meta?.getAttribute('content');

if (raw) {
  try {
    const config = JSON.parse(raw) as SentryRuntimeConfig;
    void Promise.all([import('@sentry/nextjs'), import('./lib/observability/sentry-options')]).then(
      ([Sentry, { sentryOptions }]) => Sentry.init(sentryOptions(config)),
    );
  } catch {
    // A malformed tag must never break the app.
  }
}
