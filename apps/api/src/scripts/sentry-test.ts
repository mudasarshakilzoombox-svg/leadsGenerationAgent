// Sends one test error to Sentry through the production setup (docs/OPS_SETUP.md step 10):
//   docker compose -p lga exec api node dist/scripts/sentry-test.js
// The message contains a fake email on purpose: in Sentry it must show as [EMAIL].
import { flushSentry, initSentry, loadApiEnv, reportError } from '@lga/core';

const env = loadApiEnv(process.env);
if (!initSentry('api', env)) {
  process.stderr.write('SENTRY_DSN is not set: nothing sent.\n');
  process.exit(1);
}
reportError(new Error('Sentry test event for jane.doe@example.com'), { code: 'SENTRY_TEST' });
const sent = await flushSentry(10_000);
process.stdout.write(
  sent ? 'Test event sent. Check Sentry for "[EMAIL]".\n' : 'Flush timed out.\n',
);
process.exit(sent ? 0 : 1);
