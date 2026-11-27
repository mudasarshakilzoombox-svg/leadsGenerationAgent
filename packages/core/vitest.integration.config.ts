import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Integration tests need PostgreSQL with migrations applied (`pnpm infra:up && pnpm db:deploy`).
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/integration/**/*.test.ts'],
    environment: 'node',
    // Files share one database (catalog sync, seed), so run them one at a time.
    fileParallelism: false,
    setupFiles: ['../../infra/scripts/vitest-load-env.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
