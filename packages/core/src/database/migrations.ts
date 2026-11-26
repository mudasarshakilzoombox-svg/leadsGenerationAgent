import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** `packages/core/prisma/migrations`, resolved from both `src/` (tests) and `dist/` (runtime). */
export function defaultMigrationsDir(): string {
  return fileURLToPath(new URL('../../prisma/migrations', import.meta.url));
}

/** Number of migrations shipped with this build. Readiness requires all of them applied. */
export function countLocalMigrations(dir: string = defaultMigrationsDir()): number {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory() && existsSync(path.join(dir, entry.name, 'migration.sql')),
  ).length;
}

export interface MigrationState {
  applied: number;
  failed: number;
}

/** Interpret `_prisma_migrations` counts against the expected count. Returns a failure reason or null. */
export function migrationProblem(state: MigrationState, expected: number): string | null {
  if (state.failed > 0) return `${state.failed} migration(s) failed or unfinished`;
  if (state.applied < expected) return `${expected - state.applied} migration(s) pending`;
  return null;
}
