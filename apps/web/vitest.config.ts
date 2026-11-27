import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    // Component tests opt into jsdom with `// @vitest-environment jsdom`.
    environment: 'node',
  },
});
