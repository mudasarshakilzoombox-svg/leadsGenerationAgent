import { next } from '@lga/config/eslint/next';

const config = [
  ...next(),
  {
    // Playwright fixtures receive a `use` callback; it is not React's `use` hook.
    files: ['e2e/**/*.ts'],
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
];

export default config;
