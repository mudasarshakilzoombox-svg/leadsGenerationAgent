// Git pre-commit hook (installed by simple-git-hooks via `pnpm install`): blocks commits that
// stage a secret. Needs a local gitleaks binary; without one it warns and lets the commit
// through, because CI scans every push anyway (ADR-0039).
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const probe = spawnSync('gitleaks', ['version'], { stdio: 'ignore' });

if (probe.status !== 0) {
  console.warn(
    '[pre-commit] gitleaks is not installed, so staged files were not scanned for secrets.\n' +
      '             Install it once: winget install gitleaks  (or: brew install gitleaks)',
  );
  process.exit(0);
}

const scan = spawnSync(
  'gitleaks',
  [
    'git',
    root,
    '--staged',
    '--config',
    path.join(root, '.gitleaks.toml'),
    '--redact',
    '--no-banner',
    '--verbose',
  ],
  { stdio: 'inherit' },
);
if (scan.status !== 0) {
  console.error(
    '[pre-commit] Possible secret in the staged changes (values redacted above). ' +
      'Remove it, move it to .env, and rotate it if it was ever real.',
  );
  process.exit(1);
}
