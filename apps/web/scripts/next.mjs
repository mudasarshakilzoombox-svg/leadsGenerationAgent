// Cross-platform launcher: loads the monorepo root .env (without overriding real env vars)
// and starts `next dev|start` on WEB_PORT (default 3300).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { watchPids } from '../../../infra/scripts/exit-with-parent.mjs';

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
// Next and its workers exit when this launcher dies; the launcher exits with its parent
// (turbo/pnpm). Windows does not kill child processes with their parent (ADR-0039).
const exitWithParent = pathToFileURL(
  path.join(repoRoot, 'infra/scripts/exit-with-parent.mjs'),
).href;
const child = spawn(
  process.execPath,
  [nextBin, command, '--port', port, ...process.argv.slice(3)],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      LGA_PARENT_PID: String(process.pid),
      NODE_OPTIONS: [process.env.NODE_OPTIONS, `--import=${exitWithParent}`]
        .filter(Boolean)
        .join(' '),
    },
  },
);
// Exit with turbo/pnpm or the `pnpm dev` root (infra/scripts/dev.mjs).
watchPids([process.ppid, Number(process.env.LGA_DEV_ROOT_PID)], () => {
  child.kill();
  process.exit(0);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', (code) => process.exit(code ?? 0));
