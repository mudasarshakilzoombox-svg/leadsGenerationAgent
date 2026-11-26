// Low-memory dev loop for Node packages and apps (run from the package directory).
//   node ../../infra/scripts/dev-node.mjs                     # packages: SWC watch src → dist
//   node ../../infra/scripts/dev-node.mjs --run dist/main.js  # apps: SWC watch + debounced restart
// SWC transpiles only (fast, ~40 MB). Type checking is `pnpm typecheck` and the editor.
// Apps restart once per change burst when their own dist/ or a workspace dependency's dist/ changes.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { watch } from 'chokidar';

const root = path.resolve(import.meta.dirname, '../..');
const cwd = process.cwd();
const require = createRequire(path.join(root, 'package.json'));
const swcBin = path.join(path.dirname(require.resolve('@swc/cli/package.json')), 'bin', 'swc.js');
const swcConfig = path.join(root, 'packages/config/swc/node.swcrc');
const { values } = parseArgs({ options: { run: { type: 'string' } } });

const swcArgs = [
  swcBin,
  'src',
  '-d',
  'dist',
  '--strip-leading-paths',
  '--config-file',
  swcConfig,
  '--ignore',
  '**/*.test.ts',
];

// 1. Initial compile so dist/ is complete before anything runs.
const initial = spawnSync(process.execPath, swcArgs, { stdio: 'inherit' });
if (initial.status !== 0) process.exit(initial.status ?? 1);

let stopping = false;
const swc = spawn(process.execPath, [...swcArgs, '--watch', '--quiet'], { stdio: 'inherit' });
swc.on('exit', (code) => {
  if (!stopping) {
    console.error(`[dev-node] swc watcher exited with code ${code}`);
    shutdown(code ?? 1);
  }
});

// 2. Apps: run the entrypoint and restart it (debounced) on changes.
let app;
if (values.run) {
  const entry = values.run;
  const envFile = path.join(root, '.env');
  const nodeArgs = [
    '--enable-source-maps',
    ...(existsSync(envFile) ? [`--env-file-if-exists=${envFile}`] : []),
    entry,
  ];

  const startApp = () => {
    app = spawn(process.execPath, nodeArgs, { stdio: 'inherit', env: process.env });
    const current = app;
    current.on('exit', (code, signal) => {
      if (current === app && !stopping && !restarting) {
        console.error(
          `[dev-node] ${entry} exited (${signal ?? code}). Waiting for changes to restart...`,
        );
        app = undefined;
      }
    });
  };

  let restarting = false;
  const restart = async () => {
    restarting = true;
    if (app && app.exitCode === null) {
      const old = app;
      await new Promise((resolve) => {
        old.once('exit', resolve);
        old.kill('SIGTERM');
        setTimeout(() => old.kill('SIGKILL'), 5_000).unref();
      });
    }
    restarting = false;
    console.log(`[dev-node] change detected, restarting ${entry}`);
    startApp();
  };

  // Watch this app's dist plus the dist of every workspace package it depends on.
  const watchDirs = [path.join(cwd, 'dist'), ...workspaceDependencyDists(cwd)];
  let timer;
  const ready = Date.now() + 3_000; // ignore the watcher's own startup writes
  watch(watchDirs, { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 150 } }).on(
    'all',
    (_event, file) => {
      if (!file.endsWith('.js') || Date.now() < ready) return;
      clearTimeout(timer);
      timer = setTimeout(() => void restart(), 400);
    },
  );

  startApp();
}

/** dist/ directories of workspace packages listed as `workspace:*` dependencies (one level deep). */
function workspaceDependencyDists(pkgDir) {
  const pkg = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  const deps = Object.entries({ ...pkg.dependencies }).filter(([, v]) =>
    String(v).startsWith('workspace:'),
  );
  const byName = new Map();
  for (const dir of readdirSync(path.join(root, 'packages'))) {
    const file = path.join(root, 'packages', dir, 'package.json');
    if (existsSync(file))
      byName.set(JSON.parse(readFileSync(file, 'utf8')).name, path.join(root, 'packages', dir));
  }
  return deps
    .map(([name]) => byName.get(name))
    .filter(Boolean)
    .map((dir) => path.join(dir, 'dist'));
}

function shutdown(code) {
  stopping = true;
  swc.kill();
  app?.kill('SIGTERM');
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
