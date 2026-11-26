// Vitest setup for integration tests: load the monorepo root .env (real env vars win).
import { existsSync } from 'node:fs';
import path from 'node:path';

const envFile = path.resolve(import.meta.dirname, '../../.env');
if (existsSync(envFile)) {
  const before = { ...process.env };
  process.loadEnvFile(envFile);
  Object.assign(process.env, before);
}
process.env.LOG_LEVEL ??= 'warn';
process.env.LOG_PRETTY = 'false';
