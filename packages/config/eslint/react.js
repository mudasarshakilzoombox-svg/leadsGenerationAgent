// @ts-check
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { base } from './base.js';

/**
 * React component libraries (packages/ui).
 * @param {string} tsconfigRootDir
 */
export function react(tsconfigRootDir) {
  return tseslint.config(...base(tsconfigRootDir), reactHooks.configs.flat.recommended, {
    languageOptions: { globals: { ...globals.browser } },
  });
}
