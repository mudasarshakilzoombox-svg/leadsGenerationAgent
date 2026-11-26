// Lints the config package itself (plain JS, no type information).
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**'] },
  js.configs.recommended,
  { languageOptions: { globals: globals.node } },
];
