// Cross-platform launcher: loads the monorepo root .env (without overriding real env vars)
// and starts `next dev|start` on WEB_PORT (default 3300).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const command = process.argv[2] ?? 'dev';
const repoRoot = path.resolve(import.meta.dirname, '../../..');
const envFile = path.join(repoRoot, '.env');

if (existsSync(envFile)) {
  const before = { ...process.env };
  process.loadEnvFile(envFile);
  Object.assign(process.env, before); // real environment wins over .env
}

const port = process.env.WEB_PORT ?? '3300';
const nextBin = createRequire(import.meta.url).resolve('next/dist/bin/next');
const child = spawn(
  process.execPath,
  [nextBin, command, '--port', port, ...process.argv.slice(3)],
  {
    stdio: 'inherit',
    env: process.env,
  },
);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', (code) => process.exit(code ?? 0));
