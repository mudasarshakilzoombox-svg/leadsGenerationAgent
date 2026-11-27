import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Integration tests need PostgreSQL and Valkey (`pnpm infra:up && pnpm db:deploy`, or CI services).
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/integration/**/*.test.ts'],
    environment: 'node',
    // Each file starts BullMQ workers on the shared test namespace: one file at a time.
    fileParallelism: false,
    setupFiles: ['../../infra/scripts/vitest-load-env.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
