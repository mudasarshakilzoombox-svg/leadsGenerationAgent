// Secret scan of the whole git history with gitleaks (ADR-0039).
//   pnpm secrets:scan            # full history
//   pnpm secrets:scan --staged   # staged changes only (what the pre-commit hook runs)
// Uses a local `gitleaks` binary when installed, otherwise the pinned Docker image.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { parseArgs } from 'node:util';

export const GITLEAKS_IMAGE = 'ghcr.io/gitleaks/gitleaks:v8.30.1';

const root = path.resolve(import.meta.dirname, '../..');
const { values } = parseArgs({ options: { staged: { type: 'boolean', default: false } } });

const has = (cmd, args) => spawnSync(cmd, args, { stdio: 'ignore', shell: false }).status === 0;

const gitleaksArgs = (repo, config) => [
  'git',
  repo,
  '--config',
  config,
  '--redact',
  '--no-banner',
  '--verbose',
  ...(values.staged ? ['--staged'] : []),
];

let result;
if (has('gitleaks', ['version'])) {
  result = spawnSync('gitleaks', gitleaksArgs(root, path.join(root, '.gitleaks.toml')), {
    stdio: 'inherit',
  });
} else if (has('docker', ['version'])) {
  result = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '-v',
      `${root}:/repo`,
      // The mounted repo is owned by another uid inside the container.
      '-e',
      'GIT_CONFIG_COUNT=1',
      '-e',
      'GIT_CONFIG_KEY_0=safe.directory',
      '-e',
      'GIT_CONFIG_VALUE_0=*',
      GITLEAKS_IMAGE,
      ...gitleaksArgs('/repo', '/repo/.gitleaks.toml'),
    ],
    { stdio: 'inherit' },
  );
} else {
  console.error(
    'secrets:scan needs gitleaks (winget install gitleaks / brew install gitleaks) or Docker.',
  );
  process.exit(2);
}
process.exit(result.status ?? 1);
