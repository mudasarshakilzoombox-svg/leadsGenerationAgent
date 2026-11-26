// End-to-end smoke test of a running stack (dev servers or the Docker stack).
// Usage:
//   node infra/scripts/smoke.mjs                                  # dev: web :3300, api :4000, worker :4100
//   node infra/scripts/smoke.mjs --web http://localhost:8080 --api http://localhost:8080 --no-worker
import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const root = path.resolve(import.meta.dirname, '../..');
if (existsSync(path.join(root, '.env'))) {
  const before = { ...process.env };
  process.loadEnvFile(path.join(root, '.env'));
  Object.assign(process.env, before);
}

const { values } = parseArgs({
  options: {
    web: { type: 'string', default: `http://localhost:${process.env.WEB_PORT ?? 3300}` },
    api: { type: 'string', default: `http://localhost:${process.env.API_PORT ?? 4000}` },
    worker: {
      type: 'string',
      default: `http://localhost:${process.env.WORKER_HEALTH_PORT ?? 4100}`,
    },
    'no-worker': { type: 'boolean', default: false },
    origin: { type: 'string' },
    timeout: { type: 'string', default: '90' },
  },
});

const origin = values.origin ?? new URL(values.web).origin;
const deadline = Date.now() + Number(values.timeout) * 1000;
let failures = 0;

async function get(url, init = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status, headers: res.headers, text, json };
}

/** Retry until the check passes or the global deadline expires (services may still be booting). */
async function check(name, fn) {
  let lastError;
  do {
    try {
      const detail = await fn();
      console.log(`  ✓ ${name}${detail ? `: ${detail}` : ''}`);
      return;
    } catch (error) {
      lastError =
        error instanceof Error ? (error.cause instanceof Error ? error.cause : error) : error;
      if (Date.now() < deadline) await new Promise((r) => setTimeout(r, 2000));
    }
  } while (Date.now() < deadline);
  failures++;
  console.log(`  ✗ ${name}: ${lastError instanceof Error ? lastError.message : lastError}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log(
  `Smoke test: web=${values.web} api=${values.api}${values['no-worker'] ? '' : ` worker=${values.worker}`}`,
);

await check('web /healthz', async () => {
  const r = await get(`${values.web}/healthz`);
  assert(r.status === 200 && r.json?.status === 'ok', `status ${r.status}`);
});

await check('web / renders with CSP', async () => {
  const r = await get(`${values.web}/`);
  assert(r.status === 200, `status ${r.status}`);
  assert(r.text.includes('Lead Generation Agent'), 'page title missing');
  const csp = r.headers.get('content-security-policy') ?? '';
  assert(csp.includes("frame-ancestors 'none'") && csp.includes('nonce-'), 'CSP header missing');
  assert(r.text.includes('Healthy'), 'status badges missing');
});

await check('api /health/live', async () => {
  const r = await get(`${values.api}/health/live`);
  assert(r.status === 200 && r.json?.service === 'api', `status ${r.status}`);
});

await check('api /health/ready', async () => {
  const r = await get(`${values.api}/health/ready`);
  assert(r.status === 200 && r.json?.status === 'ok', `status ${r.status} ${r.text}`);
  return Object.entries(r.json.checks)
    .map(([k, v]) => `${k}=${v.status}`)
    .join(' ');
});

await check('api /api/v1/system/info', async () => {
  const r = await get(`${values.api}/api/v1/system/info`);
  assert(r.status === 200 && r.json?.apiVersion === 'v1', `status ${r.status}`);
  return `release ${r.json.version}, env ${r.json.environment}`;
});

await check('api unknown route returns problem+json', async () => {
  const r = await get(`${values.api}/api/v1/does-not-exist`);
  assert(r.status === 404, `status ${r.status}`);
  assert(
    (r.headers.get('content-type') ?? '').includes('application/problem+json'),
    'content type',
  );
  assert(r.json?.code === 'NOT_FOUND' && r.json?.requestId, 'problem body');
});

await check('api rejects cross-origin POST (CSRF)', async () => {
  const r = await get(`${values.api}/api/v1/system/info`, {
    method: 'POST',
    headers: { origin: 'https://evil.example', 'x-requested-with': 'lga-web' },
  });
  assert(r.status === 403 && r.json?.code === 'ORIGIN_REJECTED', `status ${r.status}`);
});

await check('api accepts same-origin POST with CSRF header', async () => {
  const r = await get(`${values.api}/api/v1/system/info`, {
    method: 'POST',
    headers: { origin, 'x-requested-with': 'lga-web' },
  });
  assert(r.status === 404, `expected routing 404, got ${r.status}`);
});

if (!values['no-worker']) {
  await check('worker /health/ready (BullMQ heartbeat processed)', async () => {
    const r = await get(`${values.worker}/health/ready`);
    assert(r.status === 200 && r.json?.status === 'ok', `status ${r.status} ${r.text}`);
    return `heartbeat ${r.json.checks.heartbeat?.detail ?? ''}`;
  });
}

if (failures > 0) {
  console.log(`\n${failures} smoke check(s) failed.`);
  process.exit(1);
}
console.log('\nAll smoke checks passed.');
