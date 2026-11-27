// Table ownership for writes (AGENTS.md: each table has exactly one owning module).
// Fails when code in packages/core/src/modules/<m>/ creates, updates or deletes a Prisma model
// whose MODEL_OWNERS entry does not include <m>. Reads are allowed (read models, ADR-0035).
// Escape hatch, reviewed in PRs: `// ownership-exempt: <reason>` on the line or the line above.
//   node infra/scripts/check-ownership.mjs [--root <dir>]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { root: { type: 'string' } } });
const root = path.resolve(values.root ?? path.join(import.meta.dirname, '../..'));
const core = path.join(root, 'packages/core/src');

// MODEL_OWNERS is plain data in a TS file: `Model: ['a', 'b'],` per line.
const ownersSource = readFileSync(path.join(core, 'tenancy/model-owners.ts'), 'utf8');
const owners = new Map();
for (const match of ownersSource.matchAll(/^\s+(\w+): \[([^\]]*)\],?$/gm)) {
  const list = [...match[2].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  // Prisma client accessors are the model name with a lower-case first letter.
  owners.set(match[1][0].toLowerCase() + match[1].slice(1), { model: match[1], list });
}
if (owners.size < 10) {
  console.error('check-ownership: could not read MODEL_OWNERS from tenancy/model-owners.ts');
  process.exit(2);
}

const WRITE =
  /\.(\w+)\s*\.\s*(create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany)\s*\(/g;

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) yield* files(full);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) yield full;
  }
}

const modulesDir = path.join(core, 'modules');
const violations = [];
let scanned = 0;
for (const mod of readdirSync(modulesDir)) {
  const dir = path.join(modulesDir, mod);
  if (!statSync(dir).isDirectory()) continue;
  for (const file of files(dir)) {
    scanned++;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (/ownership-exempt:/.test(line) || /ownership-exempt:/.test(lines[i - 1] ?? '')) return;
      for (const m of line.matchAll(WRITE)) {
        const owner = owners.get(m[1]);
        if (owner && !owner.list.includes(mod)) {
          violations.push(
            `${path.relative(root, file).replaceAll('\\', '/')}:${i + 1}  module "${mod}" writes ${owner.model} (${m[2]}); owner: ${owner.list.join(', ')}`,
          );
        }
      }
    });
  }
}

if (violations.length) {
  console.error(`Table ownership violations (${violations.length}):`);
  for (const v of violations) console.error(`  ${v}`);
  console.error('Write through the owning module, or move the table (DATABASE_DESIGN §3).');
  process.exit(1);
}
console.log(`Table ownership: ${scanned} module files clean (${owners.size} models mapped).`);
