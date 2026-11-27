// Local setup: create .env from .env.example with random local-only secrets.
//   pnpm setup            -> create .env if it does not exist (never overwrites)
//   pnpm run setup --update   -> append variables that .env.example has and .env lacks
// Values are never printed: only variable names.
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const target = path.join(root, '.env');
const example = path.join(root, '.env.example');

// 32 random bytes, URL-safe: long enough for passwords and for the auth peppers (>= 32 chars).
const secret = () => randomBytes(32).toString('base64url');
// `change-me-local-keyring*`: a one-key JSON key ring (ADR-0021/0024), e.g. {"1":"<base64>"}.
const keyring = () => JSON.stringify({ 1: randomBytes(32).toString('base64') });

/** Replace `change-me-local-*` placeholders with random values (same placeholder, same value). */
function fillPlaceholders(text) {
  const replacements = new Map();
  const filled = text.replace(/change-me-local-[a-z]+/g, (placeholder) => {
    if (!replacements.has(placeholder)) {
      replacements.set(
        placeholder,
        placeholder.startsWith('change-me-local-keyring') ? keyring() : secret(),
      );
    }
    return replacements.get(placeholder);
  });
  return { filled, count: replacements.size };
}

const exampleText = readFileSync(example, 'utf8');

if (!existsSync(target)) {
  const { filled, count } = fillPlaceholders(exampleText);
  writeFileSync(target, filled);
  console.log(`Created .env with ${count} random local secrets.`);
  console.log('Next: pnpm infra:up && pnpm db:deploy && pnpm db:seed && pnpm dev');
  process.exit(0);
}

if (!process.argv.includes('--update')) {
  console.log(
    '.env already exists, leaving it unchanged. Run `pnpm run setup --update` to add new variables.',
  );
  process.exit(0);
}

const present = new Set(
  readFileSync(target, 'utf8')
    .split(/\r?\n/)
    .map((line) => /^\s*([A-Z0-9_]+)\s*=/.exec(line)?.[1])
    .filter(Boolean),
);
const missing = exampleText.split(/\r?\n/).filter((line) => {
  const key = /^([A-Z0-9_]+)=/.exec(line)?.[1];
  return key && !present.has(key);
});

if (missing.length === 0) {
  console.log('.env already has every variable from .env.example.');
  process.exit(0);
}
const { filled } = fillPlaceholders(missing.join('\n'));
appendFileSync(target, `\n# Added by pnpm run setup --update\n${filled}\n`);
console.log(`Added to .env: ${missing.map((line) => line.split('=')[0]).join(', ')}`);
