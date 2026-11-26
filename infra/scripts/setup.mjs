// First-time local setup: create .env from .env.example with random local-only passwords.
// Safe to re-run: an existing .env is never overwritten.
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const target = path.join(root, '.env');
const example = path.join(root, '.env.example');

if (existsSync(target)) {
  console.log('.env already exists, leaving it unchanged.');
  process.exit(0);
}

copyFileSync(example, target);

// Replace the `change-me-local-*` placeholders with random URL-safe values (same value everywhere).
const secret = () => randomBytes(18).toString('base64url');
const replacements = new Map();
let content = readFileSync(target, 'utf8');
content = content.replace(/change-me-local-[a-z]+/g, (placeholder) => {
  if (!replacements.has(placeholder)) replacements.set(placeholder, secret());
  return replacements.get(placeholder);
});
writeFileSync(target, content);

console.log(`Created .env with ${replacements.size} random local passwords.`);
console.log('Next: pnpm infra:up && pnpm db:deploy && pnpm dev');
