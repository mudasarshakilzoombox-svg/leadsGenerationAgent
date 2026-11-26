import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

// Load the monorepo root .env for local CLI use. Real environment variables always win.
const rootEnv = path.resolve(import.meta.dirname, '../../.env');
if (existsSync(rootEnv)) {
  const before = { ...process.env };
  process.loadEnvFile(rootEnv);
  Object.assign(process.env, before);
}

// Migrations run as the schema owner. The application connects as a DML-only role (04-database §2).
const url = process.env.DATABASE_MIGRATOR_URL ?? process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  ...(url ? { datasource: { url } } : {}),
});
