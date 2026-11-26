// @ts-check
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';
import { ignores } from './base.js';

/** Next.js app (apps/web). */
export function next() {
  return [
    ignores,
    ...nextVitals,
    ...nextTypescript,
    {
      rules: {
        // Raw HTML is only allowed in the audited SafeEmailFrame component (TM-04).
        'react/no-danger': 'error',
        'no-console': ['error', { allow: ['warn', 'error'] }],
        eqeqeq: ['error', 'always'],
      },
    },
    {
      files: ['src/components/email/SafeEmailFrame.tsx'],
      rules: { 'react/no-danger': 'off' },
    },
    prettier,
  ];
}
