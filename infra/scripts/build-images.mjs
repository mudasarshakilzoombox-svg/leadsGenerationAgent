// Build all stack images one at a time (gentler on memory and on flaky networks than a
// parallel `docker compose build`). Tags match infra/docker/compose.prod.yml.
//   node infra/scripts/build-images.mjs [api|worker|migrate|web ...]
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const release = process.env.RELEASE ?? 'dev';
const images = {
  api: ['infra/docker/backend.Dockerfile', 'runtime', 'api'],
  worker: ['infra/docker/backend.Dockerfile', 'runtime', 'worker'],
  migrate: ['infra/docker/backend.Dockerfile', 'migrate', 'api'],
  web: ['infra/docker/web.Dockerfile', 'runtime', undefined],
};

const selected = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(images);
for (const name of selected) {
  const [file, target, app] = images[name] ?? [];
  if (!file) {
    console.error(`Unknown image "${name}". Choose from: ${Object.keys(images).join(', ')}`);
    process.exit(1);
  }
  const args = [
    'build',
    '-f',
    file,
    '--target',
    target,
    '-t',
    `lga-${name}:${release}`,
    '--progress',
    'plain',
  ];
  if (app) args.push('--build-arg', `APP=${app}`);
  args.push('.');
  console.log(`\n=== Building lga-${name}:${release} ===`);
  const result = spawnSync('docker', args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`Build failed: lga-${name}`);
    process.exit(result.status ?? 1);
  }
}
console.log('\nAll images built.');
