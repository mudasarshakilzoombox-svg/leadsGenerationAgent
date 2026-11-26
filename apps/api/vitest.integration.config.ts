import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Integration tests need PostgreSQL and Valkey (`pnpm infra:up && pnpm db:deploy`, or CI services).
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/integration/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['../../infra/scripts/vitest-load-env.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
