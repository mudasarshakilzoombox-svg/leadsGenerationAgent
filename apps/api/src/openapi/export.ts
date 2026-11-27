// `pnpm openapi`: writes docs/api/openapi.json. With --check, fails when the committed file is
// out of date (CI drift check, ADR-0039).
import 'reflect-metadata';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildOpenApiDocument } from './document.js';

const target = path.resolve(import.meta.dirname, '../../../../docs/api/openapi.json');
const content = `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`;

if (process.argv.includes('--check')) {
  const current = existsSync(target) ? readFileSync(target, 'utf8').replaceAll('\r\n', '\n') : '';
  if (current !== content) {
    process.stderr.write(
      'docs/api/openapi.json is out of date. Run `pnpm openapi` and commit the result.\n',
    );
    process.exit(1);
  }
  process.stdout.write('docs/api/openapi.json is up to date.\n');
} else {
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
  process.stdout.write(`Wrote ${path.relative(process.cwd(), target)}\n`);
}
