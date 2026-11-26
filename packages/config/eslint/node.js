// @ts-check
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { base } from './base.js';

/**
 * Node.js / NestJS packages (api, worker, core, contracts, shared).
 * @param {string} tsconfigRootDir
 */
export function node(tsconfigRootDir) {
  return tseslint.config(...base(tsconfigRootDir), {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // All outbound HTTP must go through SafeFetch or the provider client (ADR-0022).
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'axios', message: 'Use SafeFetch or the provider HTTP client (ADR-0022).' },
            {
              name: 'node-fetch',
              message: 'Use SafeFetch or the provider HTTP client (ADR-0022).',
            },
            { name: 'got', message: 'Use SafeFetch or the provider HTTP client (ADR-0022).' },
          ],
        },
      ],
    },
  });
}
