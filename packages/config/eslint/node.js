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
            { name: 'undici', message: 'Use SafeFetch or the provider HTTP client (ADR-0022).' },
            {
              name: '@anthropic-ai/sdk',
              message:
                'LLM SDKs are imported only by the AiGateway provider adapters (AGENTS.md rule 7).',
            },
            {
              name: 'openai',
              message:
                'LLM SDKs are imported only by the AiGateway provider adapters (AGENTS.md rule 7).',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message:
            'Use SafeFetch for user-influenced URLs or the provider HTTP client for fixed provider hosts (ADR-0022).',
        },
      ],
    },
  });
}
